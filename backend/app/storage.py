"""All persistence is plain files/folders under storage/. No database.

storage/
  projects/{project_id}/
    original.png
    character.json
    bones.json
    mesh.json
    animations.json
    status.json
    segmented/   <- head.png, torso.png, arm_left.png, ...
    previews/
    exports/
  temp/
"""
from __future__ import annotations
import json
import shutil
import uuid
from pathlib import Path
from typing import Any

STORAGE_ROOT = Path(__file__).resolve().parent.parent / "storage"
PROJECTS_DIR = STORAGE_ROOT / "projects"
TEMP_DIR = STORAGE_ROOT / "temp"

PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
TEMP_DIR.mkdir(parents=True, exist_ok=True)


class ProjectNotFound(Exception):
    pass


def new_project_id() -> str:
    return uuid.uuid4().hex[:12]


def project_dir(project_id: str) -> Path:
    return PROJECTS_DIR / project_id


def require_project(project_id: str) -> Path:
    d = project_dir(project_id)
    if not d.exists():
        raise ProjectNotFound(project_id)
    return d


def create_project_dirs(project_id: str) -> Path:
    d = project_dir(project_id)
    (d / "segmented").mkdir(parents=True, exist_ok=True)
    (d / "previews").mkdir(parents=True, exist_ok=True)
    (d / "exports").mkdir(parents=True, exist_ok=True)
    return d


def read_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def get_status(project_id: str) -> dict:
    d = require_project(project_id)
    return read_json(d / "status.json", {
        "project_id": project_id, "status": "created", "progress": 0.0, "message": "", "error": None
    })


def set_status(project_id: str, **kwargs) -> dict:
    d = require_project(project_id)
    current = get_status(project_id)
    current.update(kwargs)
    write_json(d / "status.json", current)
    return current


def get_character(project_id: str) -> dict:
    d = require_project(project_id)
    return read_json(d / "character.json", {
        "id": project_id, "name": "Character", "assets": {}, "bones": [], "mesh": [], "animations": []
    })


def save_character(project_id: str, character: dict) -> None:
    d = require_project(project_id)
    write_json(d / "character.json", character)


def make_export_zip(project_id: str) -> Path:
    d = require_project(project_id)
    exports = d / "exports"
    exports.mkdir(exist_ok=True)
    out_base = exports / f"{project_id}_export"
    archive = shutil.make_archive(str(out_base), "zip", root_dir=d, base_dir=".")
    return Path(archive)
