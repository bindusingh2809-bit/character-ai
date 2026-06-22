"""Portkey → OpenRouter animation provider.

Sends the fixed planning system prompt + the user's prompt to an
OpenRouter model through the Portkey gateway, and validates the response
against AnimationPlan before returning it. Never returns unvalidated data.
"""
from __future__ import annotations

import json
import logging
import os

import httpx
from pydantic import ValidationError

from models.animation_models import AnimationPlan
from providers.base import AnimationProvider

logger = logging.getLogger(__name__)

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


class PortkeyAnimationProviderError(Exception):
    pass


class PortkeyAnimationProvider(AnimationProvider):
    def __init__(self):
        self.api_key = os.environ.get("PORTKEY_API_KEY")
        self.base_url = os.environ.get("PORTKEY_BASE_URL", "https://api.portkey.ai/v1")
        self.default_model = os.environ.get("OPENROUTER_MODEL", "openrouter/qwen/qwen-2.5-72b-instruct")
        self.virtual_key = os.environ.get("PORTKEY_VIRTUAL_KEY")  # optional, for OpenRouter via Portkey
        self.timeout = float(os.environ.get("PORTKEY_TIMEOUT_SECONDS", "20"))

        if not self.api_key:
            logger.warning(
                "PORTKEY_API_KEY is not set — PortkeyAnimationProvider will fail at request time."
            )

    async def generate(self, prompt: str, model: str | None = None) -> AnimationPlan:
        if not self.api_key:
            raise PortkeyAnimationProviderError(
                "PORTKEY_API_KEY is not configured on the server."
            )

        headers = {
            "Content-Type": "application/json",
            "x-portkey-api-key": self.api_key,
            "x-portkey-provider": "openrouter",
        }
        if self.virtual_key:
            headers["x-portkey-virtual-key"] = self.virtual_key

        body = {
            "model": model or self.default_model,
            "messages": [
                {"role": "system", "content": f"{SYSTEM_PROMPT}\n\n{JSON_SCHEMA_HINT}"},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
            "max_tokens": 600,
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(
                    f"{self.base_url}/chat/completions", headers=headers, json=body
                )
        except httpx.TimeoutException as exc:
            raise PortkeyAnimationProviderError("The AI provider timed out.") from exc
        except httpx.HTTPError as exc:
            raise PortkeyAnimationProviderError(f"Could not reach the AI provider: {exc}") from exc

        if resp.status_code >= 400:
            raise PortkeyAnimationProviderError(
                f"AI provider returned an error ({resp.status_code}): {resp.text[:300]}"
            )

        try:
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, ValueError) as exc:
            raise PortkeyAnimationProviderError("Unexpected response shape from AI provider.") from exc

        return self._parse_plan(content)

    @staticmethod
    def _parse_plan(content: str) -> AnimationPlan:
        content = content.strip()
        # Defensive cleanup in case the model wraps JSON in a code fence
        # despite instructions not to.
        if content.startswith("```"):
            content = content.strip("`")
            if content.lower().startswith("json"):
                content = content[4:].strip()

        try:
            raw = json.loads(content)
        except json.JSONDecodeError as exc:
            raise PortkeyAnimationProviderError(
                "AI provider did not return valid JSON."
            ) from exc

        try:
            return AnimationPlan.model_validate(raw)
        except ValidationError as exc:
            raise PortkeyAnimationProviderError(
                f"AI provider returned an invalid animation plan: {exc}"
            ) from exc
