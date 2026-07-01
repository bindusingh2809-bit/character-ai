"""BYOK Gemini provider.

Uses a user-supplied API key (never one configured on this server) to call
Google's Gemini API directly. The key is sent via the x-goog-api-key header
rather than a URL query parameter, so it can't leak into request logs or
error messages that include the URL.
"""
from __future__ import annotations

import os

import httpx

from models.animation_models import AnimationPlan
from providers.base import AnimationProvider
from providers.shared import FULL_SYSTEM_PROMPT, parse_plan

# gemini-2.5-flash-lite is Google's cheapest current model, fine for this
# small task. Override via the "model" field on the request (or
# GEMINI_BYOK_DEFAULT_MODEL) — check https://ai.google.dev/gemini-api/docs/models
# for Google's current lineup, since Gemini model names churn quickly.
DEFAULT_MODEL = os.environ.get("GEMINI_BYOK_DEFAULT_MODEL", "gemini-2.5-flash-lite")
TIMEOUT_SECONDS = float(os.environ.get("BYOK_TIMEOUT_SECONDS", "30"))


class GeminiProviderError(Exception):
    pass


class GeminiByokProvider(AnimationProvider):
    def __init__(self, api_key: str):
        if not api_key or not api_key.strip():
            raise GeminiProviderError("A Gemini API key is required.")
        self.api_key = api_key.strip()

    async def generate(self, prompt: str, model: str | None = None) -> AnimationPlan:
        model_to_use = model or DEFAULT_MODEL
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_to_use}:generateContent"
        headers = {
            "content-type": "application/json",
            "x-goog-api-key": self.api_key,
        }
        body = {
            "system_instruction": {"parts": [{"text": FULL_SYSTEM_PROMPT}]},
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0},
        }

        try:
            async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
                resp = await client.post(url, headers=headers, json=body)
        except httpx.TimeoutException as exc:
            raise GeminiProviderError("Gemini timed out.") from exc
        except httpx.HTTPError as exc:
            raise GeminiProviderError(f"Could not reach Gemini: {exc}") from exc

        if resp.status_code in (401, 403):
            raise GeminiProviderError("That Gemini API key was rejected. Double-check it.")
        if resp.status_code >= 400:
            raise GeminiProviderError(
                f"Gemini returned an error ({resp.status_code}): {resp.text[:300]}"
            )

        try:
            data = resp.json()
            parts = data["candidates"][0]["content"]["parts"]
            content = "".join(p.get("text", "") for p in parts)
        except (KeyError, IndexError, ValueError) as exc:
            raise GeminiProviderError("Unexpected response shape from Gemini.") from exc

        if not content:
            raise GeminiProviderError("Gemini returned an empty response (it may have been blocked by safety filters).")

        return parse_plan(content, error_cls=GeminiProviderError)