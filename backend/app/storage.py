"""
Simple filesystem-backed storage for characters.

Layout, matching the planning doc:

storage/characters/<character_id>/
    original.<ext>
    skeleton.json
    animations.json
"""
from __future__ import annotations

import json
import shutil
import uuid
from pathlib import Path
from typing import Optional

from app.models import Skeleton, Bone
from app.config import settings

STORAGE_ROOT = settings.storage_path.parent
CHARACTERS_DIR = settings.storage_path
CHARACTERS_DIR.mkdir(parents=True, exist_ok=True)


def new_character_id() -> str:
    return uuid.uuid4().hex[:12]


def character_dir(character_id: str) -> Path:
    return CHARACTERS_DIR / character_id


def save_upload(character_id: str, filename: str, data: bytes) -> Path:
    ext = Path(filename).suffix.lower() or ".png"
    d = character_dir(character_id)
    d.mkdir(parents=True, exist_ok=True)
    dest = d / f"original{ext}"
    dest.write_bytes(data)
    return dest


def find_original_image(character_id: str) -> Optional[Path]:
    d = character_dir(character_id)
    if not d.exists():
        return None
    for p in d.glob("original.*"):
        return p
    return None


def skeleton_path(character_id: str) -> Path:
    return character_dir(character_id) / "skeleton.json"


def save_skeleton(skeleton: Skeleton) -> None:
    p = skeleton_path(skeleton.character_id)
    p.write_text(skeleton.model_dump_json(indent=2))


def load_skeleton(character_id: str) -> Optional[Skeleton]:
    p = skeleton_path(character_id)
    if not p.exists():
        return None
    return Skeleton.model_validate_json(p.read_text())


def default_skeleton(character_id: str, name: str, width: int, height: int) -> Skeleton:
    """A brand new character starts with a single root bone in the middle."""
    root = Bone(
        id=uuid.uuid4().hex[:8],
        name="root",
        parent_id=None,
        x=width / 2,
        y=height / 2,
        rotation=0,
        length=min(width, height) * 0.25,
    )
    return Skeleton(
        character_id=character_id,
        name=name,
        image_width=width,
        image_height=height,
        bones=[root],
    )


def list_characters() -> list[dict]:
    out = []
    if not CHARACTERS_DIR.exists():
        return out
    for d in sorted(CHARACTERS_DIR.iterdir()):
        if not d.is_dir():
            continue
        skel = load_skeleton(d.name)
        img = find_original_image(d.name)
        if skel is None or img is None:
            continue
        out.append(
            {
                "id": d.name,
                "name": skel.name,
                "image_url": f"/media/characters/{d.name}/{img.name}",
                "bone_count": len(skel.bones),
            }
        )
    return out


def delete_character(character_id: str) -> bool:
    d = character_dir(character_id)
    if not d.exists():
        return False
    shutil.rmtree(d)
    return True
