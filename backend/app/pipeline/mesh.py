"""Generates a simple quad-grid polygon mesh for each segmented part PNG and
assigns vertex weights to the bones that drive that part. This is a
deliberately simple (rigid-ish, smooth-blended near joints) deformation
model — good enough for idle/walk/wave style animation without needing a
learned mesh/skinning model.
"""
from __future__ import annotations
from pathlib import Path

import numpy as np
from PIL import Image

# Which bones (in chain order) drive each part, for weight blending
PART_BONE_CHAINS = {
    "head": ["head"],
    "hair": ["head"],
    "torso": ["spine"],
    "arm_left": ["upperarm_l", "forearm_l"],
    "arm_right": ["upperarm_r", "forearm_r"],
    "leg_left": ["thigh_l", "shin_l"],
    "leg_right": ["thigh_r", "shin_r"],
}

GRID_COLS = 5
GRID_ROWS = 5


def _bbox_from_alpha(png_path: Path):
    img = np.array(Image.open(png_path).convert("RGBA"))
    alpha = img[:, :, 3]
    ys, xs = np.where(alpha > 10)
    if len(ys) == 0:
        return None
    return xs.min(), ys.min(), xs.max(), ys.max()


def _point_segment_distance(p, a, b):
    p, a, b = np.array(p, float), np.array(a, float), np.array(b, float)
    ab = b - a
    t = np.clip(np.dot(p - a, ab) / (np.dot(ab, ab) + 1e-9), 0, 1)
    proj = a + t * ab
    return np.linalg.norm(p - proj)


def _bone_lookup(bones: list[dict]) -> dict[str, dict]:
    return {b["id"]: b for b in bones}


def build_part_mesh(part: str, png_path: Path, bones: list[dict]) -> dict:
    bbox = _bbox_from_alpha(png_path)
    if bbox is None:
        return {"part": part, "vertices": [], "triangles": []}
    x0, y0, x1, y1 = bbox
    chain = PART_BONE_CHAINS.get(part, [])
    by_id = _bone_lookup(bones)

    xs = np.linspace(x0, x1, GRID_COLS)
    ys = np.linspace(y0, y1, GRID_ROWS)
    vertices = []
    for yy in ys:
        for xx in xs:
            weights = {}
            if chain:
                dists = []
                for bone_id in chain:
                    b = by_id.get(bone_id)
                    if not b:
                        continue
                    d = _point_segment_distance(
                        (xx, yy), (b["start"]["x"], b["start"]["y"]), (b["end"]["x"], b["end"]["y"])
                    )
                    dists.append((bone_id, d))
                if dists:
                    # inverse-distance weighting, normalized
                    inv = [(bid, 1.0 / (d + 1e-3)) for bid, d in dists]
                    total = sum(w for _, w in inv)
                    weights = {bid: round(w / total, 4) for bid, w in inv}
            vertices.append({"x": float(xx), "y": float(yy), "weights": weights})

    triangles = []
    for r in range(GRID_ROWS - 1):
        for c in range(GRID_COLS - 1):
            i0 = r * GRID_COLS + c
            i1 = i0 + 1
            i2 = i0 + GRID_COLS
            i3 = i2 + 1
            triangles.append([i0, i1, i2])
            triangles.append([i1, i3, i2])

    return {"part": part, "vertices": vertices, "triangles": triangles}


def build_all_meshes(parts: dict[str, str], projects_root: Path, bones: list[dict]) -> list[dict]:
    """`parts` maps part name -> path relative to `projects_root`
    (this is exactly what segmentation.save_part_pngs() returns)."""
    meshes = []
    for part, rel_path in parts.items():
        png_path = projects_root / rel_path
        meshes.append(build_part_mesh(part, png_path, bones))
    return meshes
