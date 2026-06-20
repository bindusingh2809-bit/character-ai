"""Pydantic models used across the API. No database — these mirror the
JSON files we persist under storage/projects/{project_id}/."""

from __future__ import annotations
from typing import Optional, Literal
from pydantic import BaseModel, Field


class ProjectMeta(BaseModel):
    id: str
    name: str = "Character"
    status: Literal["created", "segmented", "rigged", "meshed", "animated", "error"] = "created"
    width: int = 0
    height: int = 0


class BonePoint(BaseModel):
    x: float
    y: float


class Bone(BaseModel):
    id: str
    name: str
    parent: Optional[str] = None
    start: BonePoint
    end: BonePoint
    part: str  # which segmented layer this bone drives, e.g. "torso"


class MeshVertex(BaseModel):
    x: float
    y: float
    # bone weights: {bone_id: weight}, weights sum to ~1.0
    weights: dict[str, float] = Field(default_factory=dict)


class PartMesh(BaseModel):
    part: str
    vertices: list[MeshVertex]
    triangles: list[list[int]]  # indices into vertices, 3 per triangle


class Keyframe(BaseModel):
    time: float  # seconds, 0..duration
    # bone_id -> {x, y, rotation (deg), scale}
    bones: dict[str, dict[str, float]]


class Animation(BaseModel):
    name: str
    duration: float
    loop: bool = True
    keyframes: list[Keyframe]


class StatusResponse(BaseModel):
    project_id: str
    status: str
    progress: float = 0.0
    message: str = ""
    error: Optional[str] = None


class UploadResponse(BaseModel):
    project_id: str
    width: int
    height: int
