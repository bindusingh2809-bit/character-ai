"""Deterministic offline provider, mirrors the frontend MockAnimationProvider.
Used when no Portkey key is configured, or for tests.
"""
from __future__ import annotations

import re

from models.animation_models import AnimationAction, AnimationPlan
from providers.base import AnimationProvider

KEYWORD_MAP = [
    (re.compile(r"\bjump(s|ing)?\b", re.I), "jump"),
    (re.compile(r"\bwave(s|ing)?\b", re.I), "wave"),
    (re.compile(r"\bpoint(s|ing)?\b", re.I), "point"),
    (re.compile(r"\bclap(s|ping)?\b", re.I), "clap"),
    (re.compile(r"\bdanc(e|es|ing)\b", re.I), "dance"),
    (re.compile(r"\bcelebrat(e|es|ing)\b", re.I), "celebrate"),
    (re.compile(r"\bsit(s|ting)?\b", re.I), "sit"),
    (re.compile(r"\block(s|ing)? left\b", re.I), "look_left"),
    (re.compile(r"\block(s|ing)? right\b", re.I), "look_right"),
    (re.compile(r"\bnod(s|ding)?\b", re.I), "nod"),
    (re.compile(r"\bshake[s]? .*head\b", re.I), "shake_head"),
    (re.compile(r"\brun(s|ning)?\b", re.I), "run"),
    (re.compile(r"\bwalk(s|ing)?\b", re.I), "walk"),
    (re.compile(r"\bidle\b|\bstand(s|ing)?\b|\bstop(s|ping)?\b", re.I), "idle"),
]

WORD_COUNTS = {"twice": 2, "two": 2, "three": 3, "thrice": 3, "four": 4}


def _extract_side(segment: str) -> str | None:
    if re.search(r"\bleft\b", segment, re.I):
        return "left"
    if re.search(r"\bright\b", segment, re.I):
        return "right"
    return None


def _extract_count(segment: str) -> int | None:
    m = re.search(r"\b(twice|two|three|thrice|four)\b", segment, re.I)
    if m:
        return WORD_COUNTS[m.group(1).lower()]
    m = re.search(r"\b(\d+)\s*times?\b", segment, re.I)
    if m:
        return int(m.group(1))
    return None


class MockAnimationProvider(AnimationProvider):
    async def generate(self, prompt: str, model: str | None = None) -> AnimationPlan:
        segments = [s.strip() for s in re.split(r",|\bthen\b|\band\b", prompt, flags=re.I) if s.strip()]

        actions: list[AnimationAction] = []
        for segment in segments:
            match = next((name for pattern, name in KEYWORD_MAP if pattern.search(segment)), None)
            if not match:
                continue
            kwargs = {"name": match}
            side = _extract_side(segment)
            if side:
                kwargs["side"] = side
            count = _extract_count(segment)
            if count:
                kwargs["count"] = count
            actions.append(AnimationAction(**kwargs))

        if not actions:
            actions.append(AnimationAction(name="idle"))

        return AnimationPlan(actions=actions)
