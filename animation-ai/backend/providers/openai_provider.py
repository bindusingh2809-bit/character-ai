"""BYOK OpenAI provider.

Uses a user-supplied API key (never one configured on this server) to call
OpenAI's Chat Completions API directly. The key is used only for this one
outgoing request and is never persisted.
"""
from __future__ import annotations

import os

import httpx

from models.animation_models import AnimationPlan
from providers.base import AnimationProvider
from providers.shared import FULL_SYSTEM_PROMPT, parse_plan

# gpt-4.1-mini is a solid cheap default for this small task. Override via
# the "model" field on the request (or OPENAI_BYOK_DEFAULT_MODEL) — check
# https://platform.openai.com/docs/models for OpenAI's current lineup.
DEFAULT_MODEL = os.environ.get("OPENAI_BYOK_DEFAULT_MODEL", "gpt-4.1-mini")
TIMEOUT_SECONDS = float(os.environ.get("BYOK_TIMEOUT_SECONDS", "30"))


class OpenAIProviderError(Exception):
    pass


class OpenAIByokProvider(AnimationProvider):
    def __init__(self, api_key: str):
        if not api_key or not api_key.strip():
            raise OpenAIProviderError("An OpenAI API key is required.")
        self.api_key = api_key.strip()

    async def generate(self, prompt: str, model: str | None = None) -> AnimationPlan:
        headers = {
            "content-type": "application/json",
            "authorization": f"Bearer {self.api_key}",
        }
        body = {
            "model": model or DEFAULT_MODEL,
            "messages": [
                {"role": "system", "content": FULL_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0,
        }

        try:
            async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
                resp = await client.post(
                    "https://api.openai.com/v1/chat/completions", headers=headers, json=body
                )
        except httpx.TimeoutException as exc:
            raise OpenAIProviderError("OpenAI timed out.") from exc
        except httpx.HTTPError as exc:
            raise OpenAIProviderError(f"Could not reach OpenAI: {exc}") from exc

        if resp.status_code == 401:
            raise OpenAIProviderError("That OpenAI API key was rejected (401). Double-check it.")
        if resp.status_code >= 400:
            raise OpenAIProviderError(
                f"OpenAI returned an error ({resp.status_code}): {resp.text[:300]}"
            )

        try:
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, ValueError) as exc:
            raise OpenAIProviderError("Unexpected response shape from OpenAI.") from exc

        return parse_plan(content, error_cls=OpenAIProviderError)