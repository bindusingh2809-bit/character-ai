"""
Pydantic models for the "Universal Rig Format" (URF).

This is YOUR rig format (referred to in the planning doc as .mychar / .drig).
It is intentionally simple right now (bones + a single texture). Mesh
deformation, weights and per-vertex skinning can be layered on top of this
later without breaking the shape of the file.
"""
from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel, Field


class Bone(BaseModel):
    id: str
    name: str
    parent_id: Optional[str] = None
    # Root bones use (x, y) as their world position.
    # Child bones are positioned at their parent's tip, so x/y are ignored
    # for them (kept at 0) and only rotation/length matter.
    x: float = 0
    y: float = 0
    rotation: float = 0  # radians, relative to parent
    length: float = 80


class CharacterMeta(BaseModel):
    id: str
    name: str
    image_url: str
    image_width: int
    image_height: int


class Skeleton(BaseModel):
    character_id: str
    name: str
    image_width: int
    image_height: int
    bones: List[Bone] = Field(default_factory=list)


class CharacterListItem(BaseModel):
    id: str
    name: str
    image_url: str
    bone_count: int
