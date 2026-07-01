"""Animation generation service — the only place route handlers talk to.

Picks an AnimationProvider based on env config and wraps provider errors
into a single, predictable exception type for the API layer to handle.
"""
from __future__ import annotations

import asyncio
import os

from models.animation_models import AnimationPlan, GenerateAnimationRequest
from providers.anthropic_provider import AnthropicByokProvider, AnthropicProviderError
from providers.base import AnimationProvider
from providers.gemini_provider import GeminiByokProvider, GeminiProviderError
from providers.mock_provider import MockAnimationProvider
from providers.ollama_provider import OllamaAnimationProvider, OllamaAnimationProviderError
from providers.openai_provider import OpenAIByokProvider, OpenAIProviderError
from providers.portkey_provider import PortkeyAnimationProvider, PortkeyAnimationProviderError

REQUEST_TIMEOUT_SECONDS = float(os.environ.get("ANIMATION_REQUEST_TIMEOUT_SECONDS", "25"))

PROVIDER_ERRORS = (
    PortkeyAnimationProviderError,
    OllamaAnimationProviderError,
    AnthropicProviderError,
    OpenAIProviderError,
    GeminiProviderError,
)


class AnimationServiceError(Exception):
    """Raised for any failure the API layer should surface to the client."""


def _select_provider(req: GenerateAnimationRequest) -> AnimationProvider:
    # A per-request BYOK key always wins over the server's own configured
    # provider — this is the whole point: the caller pays for their own
    # inference instead of the developer's Portkey/Ollama budget.
    if req.provider == "anthropic":
        return AnthropicByokProvider(req.api_key or "")
    if req.provider == "openai":
        return OpenAIByokProvider(req.api_key or "")
    if req.provider == "gemini":
        return GeminiByokProvider(req.api_key or "")

    provider_name = os.environ.get("ANIMATION_PROVIDER", "portkey").lower()
    if provider_name == "mock":
        return MockAnimationProvider()
    if provider_name == "ollama":
        return OllamaAnimationProvider()
    return PortkeyAnimationProvider()


async def generate_animation_plan(req: GenerateAnimationRequest) -> AnimationPlan:
    prompt = req.prompt.strip()
    if not prompt:
        raise AnimationServiceError("Prompt must not be empty.")
    if req.provider is not None and not (req.api_key and req.api_key.strip()):
        raise AnimationServiceError(f"An API key is required to use {req.provider}.")

    provider = _select_provider(req)

    try:
        return await asyncio.wait_for(
            provider.generate(prompt, model=req.model), timeout=REQUEST_TIMEOUT_SECONDS
        )
    except asyncio.TimeoutError as exc:
        raise AnimationServiceError("Animation generation timed out. Please try again.") from exc
    except PROVIDER_ERRORS as exc:
        raise AnimationServiceError(str(exc)) from exc