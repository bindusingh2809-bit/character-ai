from __future__ import annotations

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from PIL import Image, ImageOps
import io

from app import storage
from app.config import settings
from app.models import Skeleton, CharacterMeta, CharacterListItem

router = APIRouter(prefix="/api/characters", tags=["characters"])

ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "image/jpg"}


@router.post("/upload", response_model=CharacterMeta)
async def upload_character(
    name: str = Form(...),
    file: UploadFile = File(...),
):
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(400, f"Unsupported file type: {file.content_type}. Use PNG or JPEG.")

    data = await file.read()
    if len(data) > settings.max_upload_bytes:
        mb = settings.max_upload_bytes / (1024 * 1024)
        raise HTTPException(400, f"File too large. Max size is {mb:.0f} MB.")
    try:
        with Image.open(io.BytesIO(data)) as im:
            # Browsers (and MediaPipe, reading from a loaded <img>) apply
            # EXIF orientation automatically, but PIL's `im.size` does not
            # — for a portrait phone photo stored with EXIF rotation, that
            # mismatch makes the backend report swapped width/height
            # relative to what the frontend actually sees, which throws
            # off bone placement and cutout cropping by 90°. Baking the
            # rotation into the pixels here means every consumer (PIL,
            # the browser, MediaPipe) agrees on the same upright image.
            im = ImageOps.exif_transpose(im)
            width, height = im.size

            # Re-encode the (now upright, EXIF-stripped) image so the
            # bytes we save match the dimensions we just measured.
            buf = io.BytesIO()
            save_format = "PNG" if file.content_type == "image/png" else "JPEG"
            if save_format == "JPEG" and im.mode in ("RGBA", "P"):
                im = im.convert("RGB")
            im.save(buf, format=save_format)
            data = buf.getvalue()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(400, "Could not read image file.")

    character_id = storage.new_character_id()
    save_ext = ".png" if save_format == "PNG" else ".jpg"
    saved_path = storage.save_upload(character_id, f"original{save_ext}", data)

    skeleton = storage.default_skeleton(character_id, name, width, height)
    storage.save_skeleton(skeleton)

    return CharacterMeta(
        id=character_id,
        name=name,
        image_url=f"/media/characters/{character_id}/{saved_path.name}",
        image_width=width,
        image_height=height,
    )


@router.get("", response_model=list[CharacterListItem])
def list_characters():
    return storage.list_characters()


@router.get("/{character_id}", response_model=Skeleton)
def get_character(character_id: str):
    skeleton = storage.load_skeleton(character_id)
    if skeleton is None:
        raise HTTPException(404, "Character not found")
    return skeleton


@router.put("/{character_id}/skeleton", response_model=Skeleton)
def save_skeleton(character_id: str, skeleton: Skeleton):
    if skeleton.character_id != character_id:
        raise HTTPException(400, "character_id mismatch")
    existing = storage.load_skeleton(character_id)
    if existing is None:
        raise HTTPException(404, "Character not found")
    storage.save_skeleton(skeleton)
    return skeleton


@router.delete("/{character_id}")
def delete_character(character_id: str):
    ok = storage.delete_character(character_id)
    if not ok:
        raise HTTPException(404, "Character not found")
    return {"deleted": True}