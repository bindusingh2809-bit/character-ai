from __future__ import annotations
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from PIL import Image

from . import storage
from .pipeline import segmentation, rigging, mesh as mesh_pipeline, animation

app = FastAPI(title="Character Animator AI - Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten this for production
    allow_methods=["*"],
    allow_headers=["*"],
)


def _err(project_id: str, e: Exception):
    storage.set_status(project_id, status="error", error=str(e))
    raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/upload")
async def upload(file: UploadFile = File(...)):
    project_id = storage.new_project_id()
    project_dir = storage.create_project_dirs(project_id)

    raw = await file.read()
    tmp_path = storage.TEMP_DIR / f"{project_id}_{file.filename}"
    tmp_path.write_bytes(raw)

    try:
        img = Image.open(tmp_path).convert("RGBA")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read image: {e}")

    original_path = project_dir / "original.png"
    img.save(original_path)
    tmp_path.unlink(missing_ok=True)

    character = storage.get_character(project_id)
    character["name"] = Path(file.filename).stem
    storage.save_character(project_id, character)
    storage.set_status(project_id, project_id=project_id, status="created", progress=0.1, message="Uploaded", error=None)

    return {"project_id": project_id, "width": img.width, "height": img.height}


@app.get("/api/projects/{project_id}")
def get_project(project_id: str):
    try:
        storage.require_project(project_id)
    except storage.ProjectNotFound:
        raise HTTPException(status_code=404, detail="Project not found")
    return storage.get_character(project_id)


@app.get("/api/projects/{project_id}/status")
def get_status(project_id: str):
    try:
        return storage.get_status(project_id)
    except storage.ProjectNotFound:
        raise HTTPException(status_code=404, detail="Project not found")


@app.post("/api/projects/{project_id}/segment")
def segment(project_id: str):
    try:
        project_dir = storage.require_project(project_id)
    except storage.ProjectNotFound:
        raise HTTPException(status_code=404, detail="Project not found")

    storage.set_status(project_id, status="created", progress=0.2, message="Segmenting...", error=None)
    try:
        result = segmentation.run_segmentation(project_dir / "original.png", project_dir / "segmented")
    except Exception as e:
        _err(project_id, e)
        return

    character = storage.get_character(project_id)
    character["assets"] = result["parts"]
    character["keypoints"] = result["keypoints"]
    character["used_fallback_pose"] = result["used_fallback_pose"]
    storage.save_character(project_id, character)
    storage.set_status(
        project_id, status="segmented", progress=0.4,
        message="Fallback pose used" if result["used_fallback_pose"] else "Segmentation complete",
    )
    return result


@app.post("/api/projects/{project_id}/rig")
def rig(project_id: str):
    try:
        storage.require_project(project_id)
    except storage.ProjectNotFound:
        raise HTTPException(status_code=404, detail="Project not found")

    character = storage.get_character(project_id)
    if "keypoints" not in character:
        raise HTTPException(status_code=400, detail="Run /segment before /rig")

    try:
        bones = rigging.build_bones(character["keypoints"])
    except Exception as e:
        _err(project_id, e)
        return

    d = storage.project_dir(project_id)
    storage.write_json(d / "bones.json", bones)
    character["bones"] = bones
    storage.save_character(project_id, character)
    storage.set_status(project_id, status="rigged", progress=0.6, message="Rigging complete")
    return {"bones": bones}


@app.post("/api/projects/{project_id}/mesh")
def mesh_endpoint(project_id: str):
    try:
        storage.require_project(project_id)
    except storage.ProjectNotFound:
        raise HTTPException(status_code=404, detail="Project not found")

    character = storage.get_character(project_id)
    if not character.get("bones"):
        raise HTTPException(status_code=400, detail="Run /rig before /mesh")

    try:
        meshes = mesh_pipeline.build_all_meshes(character["assets"], storage.PROJECTS_DIR, character["bones"])
    except Exception as e:
        _err(project_id, e)
        return

    d = storage.project_dir(project_id)
    storage.write_json(d / "mesh.json", meshes)
    character["mesh"] = meshes
    storage.save_character(project_id, character)
    storage.set_status(project_id, status="meshed", progress=0.8, message="Mesh generation complete")
    return {"mesh": meshes}


@app.post("/api/projects/{project_id}/animate")
def animate(project_id: str):
    try:
        storage.require_project(project_id)
    except storage.ProjectNotFound:
        raise HTTPException(status_code=404, detail="Project not found")

    character = storage.get_character(project_id)
    anims = animation.build_default_animations()

    d = storage.project_dir(project_id)
    storage.write_json(d / "animations.json", anims)
    character["animations"] = anims
    storage.save_character(project_id, character)
    storage.set_status(project_id, status="animated", progress=1.0, message="Animations generated")
    return {"animations": anims}


@app.post("/api/projects/{project_id}/save")
def save(project_id: str, character: dict):
    try:
        storage.require_project(project_id)
    except storage.ProjectNotFound:
        raise HTTPException(status_code=404, detail="Project not found")
    storage.save_character(project_id, character)
    return {"ok": True}


@app.post("/api/projects/{project_id}/export")
def export(project_id: str):
    try:
        storage.require_project(project_id)
    except storage.ProjectNotFound:
        raise HTTPException(status_code=404, detail="Project not found")
    archive_path = storage.make_export_zip(project_id)
    return FileResponse(archive_path, filename=archive_path.name, media_type="application/zip")


@app.get("/api/projects/{project_id}/assets/{part}")
def get_asset(project_id: str, part: str):
    d = storage.project_dir(project_id)
    path = d / "segmented" / f"{part}.png"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Asset not found")
    return FileResponse(path, media_type="image/png")


@app.get("/health")
def health():
    return JSONResponse({"status": "ok"})
