"""Generates default procedural animations (idle, walk, wave) as keyframes
that drive bone rotation/position. The PixiJS runtime interpolates between
these keyframes at 60 FPS.

Each keyframe's bone entry is relative to the bone's bind pose:
  { "rotation": degrees, "x": offset_px, "y": offset_px }
"""
from __future__ import annotations


def _kf(time, bones):
    return {"time": time, "bones": bones}


def animation_idle() -> dict:
    return {
        "name": "idle",
        "duration": 2.0,
        "loop": True,
        "keyframes": [
            _kf(0.0, {"spine": {"rotation": 0, "x": 0, "y": 0}, "head": {"rotation": 0}}),
            _kf(1.0, {"spine": {"rotation": 0, "x": 0, "y": -4}, "head": {"rotation": 1}}),
            _kf(2.0, {"spine": {"rotation": 0, "x": 0, "y": 0}, "head": {"rotation": 0}}),
        ],
    }


def animation_walk() -> dict:
    return {
        "name": "walk",
        "duration": 1.0,
        "loop": True,
        "keyframes": [
            _kf(0.0, {
                "thigh_l": {"rotation": 20}, "shin_l": {"rotation": -10},
                "thigh_r": {"rotation": -20}, "shin_r": {"rotation": 5},
                "upperarm_l": {"rotation": -20}, "upperarm_r": {"rotation": 20},
                "spine": {"y": 0},
            }),
            _kf(0.5, {
                "thigh_l": {"rotation": -20}, "shin_l": {"rotation": 5},
                "thigh_r": {"rotation": 20}, "shin_r": {"rotation": -10},
                "upperarm_l": {"rotation": 20}, "upperarm_r": {"rotation": -20},
                "spine": {"y": -6},
            }),
            _kf(1.0, {
                "thigh_l": {"rotation": 20}, "shin_l": {"rotation": -10},
                "thigh_r": {"rotation": -20}, "shin_r": {"rotation": 5},
                "upperarm_l": {"rotation": -20}, "upperarm_r": {"rotation": 20},
                "spine": {"y": 0},
            }),
        ],
    }


def animation_wave() -> dict:
    return {
        "name": "wave",
        "duration": 1.2,
        "loop": True,
        "keyframes": [
            _kf(0.0, {"upperarm_r": {"rotation": -90}, "forearm_r": {"rotation": 0}}),
            _kf(0.3, {"upperarm_r": {"rotation": -110}, "forearm_r": {"rotation": -25}}),
            _kf(0.6, {"upperarm_r": {"rotation": -90}, "forearm_r": {"rotation": 10}}),
            _kf(0.9, {"upperarm_r": {"rotation": -110}, "forearm_r": {"rotation": -25}}),
            _kf(1.2, {"upperarm_r": {"rotation": -90}, "forearm_r": {"rotation": 0}}),
        ],
    }


def build_default_animations() -> list[dict]:
    return [animation_idle(), animation_walk(), animation_wave()]
