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


BYOK_PROVIDERS = ("anthropic", "openai", "gemini")


class GenerateAnimationRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=500)
    model: Optional[str] = None  # optional override of OPENROUTER_MODEL / BYOK default model

    # BYOK ("bring your own key") fields. When provider is one of
    # BYOK_PROVIDERS, api_key is required and the request is routed straight
    # to that provider using the caller's own key instead of this server's
    # configured ANIMATION_PROVIDER. The key is used only for the duration
    # of this request — never logged, stored, or echoed back.
    provider: Optional[Literal["anthropic", "openai", "gemini"]] = None
    api_key: Optional[str] = Field(default=None, max_length=300, repr=False)

    def __repr__(self) -> str:  # pragma: no cover - defensive against accidental logging
        return (
            f"GenerateAnimationRequest(prompt={self.prompt!r}, model={self.model!r}, "
            f"provider={self.provider!r}, api_key={'<redacted>' if self.api_key else None})"
        )


class GenerateAnimationResponse(AnimationPlan):
    """Same shape as AnimationPlan; kept as a distinct type so the API
    contract can evolve independently (e.g. adding metadata) later."""

    pass