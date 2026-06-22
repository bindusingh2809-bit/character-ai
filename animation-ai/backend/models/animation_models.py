"""Pydantic models for the Prompt-to-Animation system.

These models are the single source of truth for what an "Animation Plan"
JSON object may look like. The LLM is only ever allowed to produce data
that fits this schema — never raw bone/keyframe data.
"""
from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

# Keep in sync with src/ai/motions/motionLibrary.js MOTION_LIBRARY keys.
SUPPORTED_ACTIONS = (
    "idle",
    "walk",
    "run",
    "jump",
    "wave",
    "point",
    "clap",
    "dance",
    "celebrate",
    "sit",
    "look_left",
    "look_right",
    "nod",
    "shake_head",
)


class AnimationAction(BaseModel):
    """One semantic action in a plan. The LLM must never set bone/rotation
    fields directly — only these high-level fields."""

    name: str
    duration: Optional[float] = Field(default=None, gt=0, le=30)
    side: Optional[Literal["left", "right"]] = None
    count: Optional[int] = Field(default=None, gt=0, le=20)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if v not in SUPPORTED_ACTIONS:
            raise ValueError(
                f'"{v}" is not a supported action. Supported actions: {", ".join(SUPPORTED_ACTIONS)}'
            )
        return v


class AnimationPlan(BaseModel):
    """The complete structured output the LLM must produce."""

    actions: List[AnimationAction] = Field(min_length=1, max_length=20)


class GenerateAnimationRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=500)
    model: Optional[str] = None  # optional override of OPENROUTER_MODEL


class GenerateAnimationResponse(AnimationPlan):
    """Same shape as AnimationPlan; kept as a distinct type so the API
    contract can evolve independently (e.g. adding metadata) later."""

    pass
