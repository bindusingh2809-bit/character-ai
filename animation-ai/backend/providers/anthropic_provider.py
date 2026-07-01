"""BYOK Anthropic provider.

Uses a user-supplied API key (never one configured on this server) to call
Anthropic's Messages API directly. The key lives only for the duration of
this one request — it is never written to disk, a database, or a log line.
"""
from __future__ import annotations

import os

import httpx

from models.animation_models import AnimationPlan
from providers.base import AnimationProvider
from providers.shared import FULL_SYSTEM_PROMPT, parse_plan

# claude-haiku-4-5 is Anthropic's current fast/cheap model, well suited to
# this small classification-style task. Override via the "model" field on
# the request (or ANTHROPIC_BYOK_DEFAULT_MODEL) if this drifts out of date —
# check https://docs.claude.com for the current model list.
DEFAULT_MODEL = os.environ.get("ANTHROPIC_BYOK_DEFAULT_MODEL", "claude-haiku-4-5-20251001")
API_VERSION = "2023-06-01"
TIMEOUT_SECONDS = float(os.environ.get("BYOK_TIMEOUT_SECONDS", "30"))


class AnthropicProviderError(Exception):
    pass


class AnthropicByokProvider(AnimationProvider):
    def __init__(self, api_key: str):
        if not api_key or not api_key.strip():
            raise AnthropicProviderError("An Anthropic API key is required.")
        self.api_key = api_key.strip()

    async def generate(self, prompt: str, model: str | None = None) -> AnimationPlan:
        headers = {
            "content-type": "application/json",
            "x-api-key": self.api_key,
            "anthropic-version": API_VERSION,
        }
        body = {
            "model": model or DEFAULT_MODEL,
            "max_tokens": 600,
            "system": FULL_SYSTEM_PROMPT,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0,
        }

        try:
            async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
                resp = await client.post(
                    "https://api.anthropic.com/v1/messages", headers=headers, json=body
                )
        except httpx.TimeoutException as exc:
            raise AnthropicProviderError("Anthropic timed out.") from exc
        except httpx.HTTPError as exc:
            raise AnthropicProviderError(f"Could not reach Anthropic: {exc}") from exc

        if resp.status_code == 401:
            raise AnthropicProviderError("That Anthropic API key was rejected (401). Double-check it.")
        if resp.status_code >= 400:
            raise AnthropicProviderError(
                f"Anthropic returned an error ({resp.status_code}): {resp.text[:300]}"
            )

        try:
            data = resp.json()
            content = "".join(
                block.get("text", "") for block in data.get("content", []) if block.get("type") == "text"
            )
        except (KeyError, ValueError) as exc:
            raise AnthropicProviderError("Unexpected response shape from Anthropic.") from exc

        if not content:
            raise AnthropicProviderError("Anthropic returned an empty response.")

        return parse_plan(content, error_cls=AnthropicProviderError)