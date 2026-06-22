"""AnimationProvider abstraction.

Mirrors the frontend's src/ai/providers/AnimationProvider.js contract so
business code (animation_service.py) never depends on Portkey directly.
Future providers (Ollama, direct OpenAI, direct Anthropic) just implement
this same interface.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from models.animation_models import AnimationPlan


class AnimationProvider(ABC):
    @abstractmethod
    async def generate(self, prompt: str, model: str | None = None) -> AnimationPlan:
        """Convert a natural-language prompt into a validated AnimationPlan."""
        raise NotImplementedError
