"""Ollama animation provider.

Talks directly to a locally/Docker-hosted Ollama instance via its
OpenAI-compatible endpoint (/v1/chat/completions) — no Portkey, no
external API key. Same SYSTEM_PROMPT/JSON contract as the Portkey
provider so AnimationPlan validation behaves identically regardless
of which provider is selected.
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
    'You MUST respond with ONLY this exact JSON structure, no other text:\n'
    '{"actions": [{"name": "wave", "duration": 2, "side": "right"}]}\n\n'
    'Rules:\n'
    '- "actions" key is REQUIRED (not "action")\n'
    '- Each item MUST have "name" as a string from the allowed list\n'
    '- "duration" (seconds, optional), "side" ("left"/"right", optional), '
    '"count" (integer, optional)\n'
    '- No markdown, no explanation, no extra keys. ONLY the JSON object.'
)


class OllamaAnimationProviderError(Exception):
    pass


class OllamaAnimationProvider(AnimationProvider):
    def __init__(self):
        # Host-mapped port per docker run -p 11434:11434. If this backend is
        # itself moved into the same docker network as Ollama, switch this to
        # the Ollama container's service/name, e.g. http://ollama:11434.
        self.base_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
        self.default_model = os.environ.get("OLLAMA_MODEL", "llama3.1")
        self.timeout = float(os.environ.get("OLLAMA_TIMEOUT_SECONDS", "60"))

    async def generate(self, prompt: str, model: str | None = None) -> AnimationPlan:
        body = {
            "model": model or self.default_model,
            "messages": [
                {"role": "system", "content": f"{SYSTEM_PROMPT}\n\n{JSON_SCHEMA_HINT}"},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0,
            "stream": False,
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(
                    f"{self.base_url}/v1/chat/completions", json=body
                )
        except httpx.ConnectError as exc:
            raise OllamaAnimationProviderError(
                f"Could not reach Ollama at {self.base_url}. "
                "Is the container running and is the port mapped correctly?"
            ) from exc
        except httpx.TimeoutException as exc:
            raise OllamaAnimationProviderError(
                "Ollama timed out. Local models can be slow on first load "
                "(cold start while the model loads into memory) — try again."
            ) from exc
        except httpx.HTTPError as exc:
            raise OllamaAnimationProviderError(f"Could not reach Ollama: {exc}") from exc

        if resp.status_code >= 400:
            raise OllamaAnimationProviderError(
                f"Ollama returned an error ({resp.status_code}): {resp.text[:300]}"
            )

        try:
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, ValueError) as exc:
            raise OllamaAnimationProviderError("Unexpected response shape from Ollama.") from exc

        return self._parse_plan(content)

    @staticmethod
    def _parse_plan(content: str) -> AnimationPlan:
        content = content.strip()
        # Local models are even more prone to wrapping JSON in code fences
        # or adding a stray sentence before/after despite instructions.
        if content.startswith("```"):
            content = content.strip("`")
            if content.lower().startswith("json"):
                content = content[4:].strip()

        # Defensive: if there's leading/trailing prose around the JSON object,
        # try to isolate the {...} block before giving up.
        if not content.startswith("{"):
            start = content.find("{")
            end = content.rfind("}")
            if start != -1 and end != -1 and end > start:
                content = content[start : end + 1]

        try:
            raw = json.loads(content)
        except json.JSONDecodeError as exc:
            raise OllamaAnimationProviderError(
                "Ollama did not return valid JSON."
            ) from exc

        try:
            return AnimationPlan.model_validate(raw)
        except ValidationError as exc:
            raise OllamaAnimationProviderError(
                f"Ollama returned an invalid animation plan: {exc}"
            ) from exc
