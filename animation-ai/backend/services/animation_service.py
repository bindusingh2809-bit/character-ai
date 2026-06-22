"""Animation generation service — the only place route handlers talk to.

Picks an AnimationProvider based on env config and wraps provider errors
into a single, predictable exception type for the API layer to handle.
"""
from __future__ import annotations

import asyncio
import os

from models.animation_models import AnimationPlan
from providers.base import AnimationProvider
from providers.mock_provider import MockAnimationProvider
from providers.ollama_provider import OllamaAnimationProvider, OllamaAnimationProviderError
from providers.portkey_provider import PortkeyAnimationProvider, PortkeyAnimationProviderError

REQUEST_TIMEOUT_SECONDS = float(os.environ.get("ANIMATION_REQUEST_TIMEOUT_SECONDS", "25"))


class AnimationServiceError(Exception):
    """Raised for any failure the API layer should surface to the client."""


def _select_provider() -> AnimationProvider:
    provider_name = os.environ.get("ANIMATION_PROVIDER", "portkey").lower()
    if provider_name == "mock":
        return MockAnimationProvider()
    if provider_name == "ollama":
        return OllamaAnimationProvider()
    return PortkeyAnimationProvider()


async def generate_animation_plan(prompt: str, model: str | None = None) -> AnimationPlan:
    prompt = prompt.strip()
    if not prompt:
        raise AnimationServiceError("Prompt must not be empty.")

    provider = _select_provider()

    try:
        return await asyncio.wait_for(
            provider.generate(prompt, model=model), timeout=REQUEST_TIMEOUT_SECONDS
        )
    except asyncio.TimeoutError as exc:
        raise AnimationServiceError("Animation generation timed out. Please try again.") from exc
    except (PortkeyAnimationProviderError, OllamaAnimationProviderError) as exc:
        raise AnimationServiceError(str(exc)) from exc