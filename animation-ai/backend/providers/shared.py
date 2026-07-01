"""Shared prompt contract + response parsing for LLM-backed providers.

Portkey and Ollama already had their own near-identical copies of this
before BYOK was added; new providers should import from here instead of
copy-pasting a fourth/fifth version.
"""
from __future__ import annotations

import json

from pydantic import ValidationError

from models.animation_models import AnimationPlan

SYSTEM_PROMPT = """You are an animation planning engine.

Convert user prompts into structured animation actions.

Available actions:

* idle
* walk
* run
* jump
* wave
* point
* clap
* dance
* celebrate
* sit
* look_left
* look_right
* nod
* shake_head

Return ONLY valid JSON.

Never return explanations.

Never return markdown.

Return action sequences only."""

JSON_SCHEMA_HINT = (
    'Respond with exactly this shape and nothing else: '
    '{"actions": [{"name": "wave", "duration": 2, "side": "right"}]}. '
    '"duration" is seconds (optional), "side" is "left" or "right" (optional), '
    '"count" is an optional integer repeat count.'
)

FULL_SYSTEM_PROMPT = f"{SYSTEM_PROMPT}\n\n{JSON_SCHEMA_HINT}"


def parse_plan(content: str, *, error_cls: type[Exception]) -> AnimationPlan:
    """Parse a raw LLM text response into a validated AnimationPlan.

    error_cls is the provider-specific error type to raise on failure, so
    callers keep their own distinct exception types for the service layer
    to catch.
    """
    content = content.strip()
    if content.startswith("```"):
        content = content.strip("`")
        if content.lower().startswith("json"):
            content = content[4:].strip()

    if not content.startswith("{"):
        start = content.find("{")
        end = content.rfind("}")
        if start != -1 and end != -1 and end > start:
            content = content[start : end + 1]

    try:
        raw = json.loads(content)
    except json.JSONDecodeError as exc:
        raise error_cls("The model did not return valid JSON.") from exc

    try:
        return AnimationPlan.model_validate(raw)
    except ValidationError as exc:
        raise error_cls(f"The model returned an invalid animation plan: {exc}") from exc