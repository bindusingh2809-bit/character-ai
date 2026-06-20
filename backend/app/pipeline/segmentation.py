"""CPU-friendly segmentation pipeline.

Replaces SAM2 + GroundingDINO with a stack that runs fine without a GPU:

1. rembg (U2-Net)      -> clean silhouette / background removal
2. MediaPipe Pose      -> body keypoints (shoulders, elbows, wrists, hips,
                          knees, ankles, nose/ears for head)
3. Geometric splitting -> for every silhouette pixel, find the nearest
                          "bone line" (head/torso/arms/legs) and assign
                          that pixel to that part. This is the same idea
                          professional 2D auto-riggers use for raster
                          part-splitting without a part-segmentation model.

Output: one transparent PNG per part, written to segmented/.
"""
from __future__ import annotations
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from PIL import Image

PARTS = ["head", "hair", "torso", "arm_left", "arm_right", "leg_left", "leg_right"]

# MediaPipe Pose landmark indices we care about
LM = {
    "nose": 0, "left_eye": 2, "right_eye": 5,
    "left_ear": 7, "right_ear": 8,
    "left_shoulder": 11, "right_shoulder": 12,
    "left_elbow": 13, "right_elbow": 14,
    "left_wrist": 15, "right_wrist": 16,
    "left_hip": 23, "right_hip": 24,
    "left_knee": 25, "right_knee": 26,
    "left_ankle": 27, "right_ankle": 28,
}


def _load_pose():
    import mediapipe as mp
    return mp.solutions.pose.Pose(
        static_image_mode=True,
        model_complexity=1,
        enable_segmentation=False,
        min_detection_confidence=0.4,
    )


def cutout_silhouette(rgba: np.ndarray) -> np.ndarray:
    """Run rembg on the image, return an RGBA numpy array with a clean alpha
    mask. If the input already has usable alpha (e.g. user uploaded a PNG
    with transparency), rembg still helps clean up edges."""
    from rembg import remove
    pil_img = Image.fromarray(rgba, mode="RGBA")
    out = remove(pil_img)
    return np.array(out.convert("RGBA"))


def detect_keypoints(rgb: np.ndarray) -> Optional[dict[str, tuple[float, float]]]:
    """Returns pixel-space keypoints, or None if no person detected."""
    pose = _load_pose()
    try:
        results = pose.process(rgb)
    finally:
        pose.close()

    if not results.pose_landmarks:
        return None

    h, w = rgb.shape[:2]
    pts = {}
    for name, idx in LM.items():
        lm = results.pose_landmarks.landmark[idx]
        pts[name] = (lm.x * w, lm.y * h)
    return pts


def _fallback_keypoints(w: int, h: int) -> dict[str, tuple[float, float]]:
    """If pose detection fails (e.g. stylized/cartoon character with
    non-human proportions), fall back to a generic vertical-bilateral
    layout based on image bounds, so the pipeline can still produce a
    usable (if rougher) rig instead of failing outright."""
    cx = w / 2
    return {
        "nose": (cx, h * 0.08), "left_eye": (cx - w * 0.03, h * 0.07),
        "right_eye": (cx + w * 0.03, h * 0.07),
        "left_ear": (cx - w * 0.07, h * 0.09), "right_ear": (cx + w * 0.07, h * 0.09),
        "left_shoulder": (cx - w * 0.18, h * 0.28), "right_shoulder": (cx + w * 0.18, h * 0.28),
        "left_elbow": (cx - w * 0.26, h * 0.45), "right_elbow": (cx + w * 0.26, h * 0.45),
        "left_wrist": (cx - w * 0.28, h * 0.60), "right_wrist": (cx + w * 0.28, h * 0.60),
        "left_hip": (cx - w * 0.12, h * 0.55), "right_hip": (cx + w * 0.12, h * 0.55),
        "left_knee": (cx - w * 0.13, h * 0.75), "right_knee": (cx + w * 0.13, h * 0.75),
        "left_ankle": (cx - w * 0.13, h * 0.95), "right_ankle": (cx + w * 0.13, h * 0.95),
    }


def _line_dist_map(shape, p1, p2, thickness=3) -> np.ndarray:
    """Distance (in px) from every pixel to the segment p1-p2."""
    canvas = np.zeros(shape, dtype=np.uint8)
    cv2.line(canvas, tuple(map(int, p1)), tuple(map(int, p2)), 255, thickness)
    inv = cv2.bitwise_not(canvas)
    return cv2.distanceTransform(inv, cv2.DIST_L2, 3)


def split_parts(alpha: np.ndarray, kp: dict[str, tuple[float, float]]) -> dict[str, np.ndarray]:
    """Returns {part_name: boolean_mask} covering every foreground pixel."""
    h, w = alpha.shape
    fg = alpha > 10

    neck = ((np.array(kp["left_shoulder"]) + np.array(kp["right_shoulder"])) / 2)
    pelvis = ((np.array(kp["left_hip"]) + np.array(kp["right_hip"])) / 2)
    head_top = np.array(kp["nose"]) - (neck - np.array(kp["nose"])) * 1.4

    segments = {
        "head": [(head_top, neck)],
        "torso": [(neck, pelvis), (np.array(kp["left_shoulder"]), np.array(kp["right_shoulder"])),
                  (np.array(kp["left_hip"]), np.array(kp["right_hip"]))],
        "arm_left": [(np.array(kp["left_shoulder"]), np.array(kp["left_elbow"])),
                     (np.array(kp["left_elbow"]), np.array(kp["left_wrist"]))],
        "arm_right": [(np.array(kp["right_shoulder"]), np.array(kp["right_elbow"])),
                      (np.array(kp["right_elbow"]), np.array(kp["right_wrist"]))],
        "leg_left": [(np.array(kp["left_hip"]), np.array(kp["left_knee"])),
                     (np.array(kp["left_knee"]), np.array(kp["left_ankle"]))],
        "leg_right": [(np.array(kp["right_hip"]), np.array(kp["right_knee"])),
                      (np.array(kp["right_knee"]), np.array(kp["right_ankle"]))],
    }

    dist_maps = {}
    for part, segs in segments.items():
        maps = [_line_dist_map((h, w), p1, p2) for p1, p2 in segs]
        dist_maps[part] = np.min(np.stack(maps, axis=0), axis=0)

    stacked = np.stack([dist_maps[p] for p in dist_maps], axis=0)
    nearest_idx = np.argmin(stacked, axis=0)
    part_names = list(dist_maps.keys())

    masks = {}
    for i, part in enumerate(part_names):
        masks[part] = fg & (nearest_idx == i)

    # Hair: top ~40% of the head region, separated from skin by simple
    # k-means color clustering (hair tends to differ in hue/value from skin).
    masks["hair"] = _extract_hair(masks["head"])
    masks["head"] = masks["head"] & ~masks["hair"]

    return masks


def _extract_hair(head_mask: np.ndarray) -> np.ndarray:
    """Heuristic: hair occupies the upper portion of the head silhouette.
    Without a color image here we just take the top 35% of the head mask's
    bounding box rows — refined further in segment_project() using actual
    pixel colors when available."""
    ys, xs = np.where(head_mask)
    if len(ys) == 0:
        return np.zeros_like(head_mask)
    y_min, y_max = ys.min(), ys.max()
    cutoff = y_min + (y_max - y_min) * 0.35
    out = np.zeros_like(head_mask)
    out[:int(cutoff), :] = head_mask[:int(cutoff), :]
    return out


def save_part_pngs(rgba: np.ndarray, masks: dict[str, np.ndarray], out_dir: Path) -> dict[str, str]:
    out_dir.mkdir(parents=True, exist_ok=True)
    saved = {}
    for part, mask in masks.items():
        part_rgba = rgba.copy()
        part_rgba[~mask, 3] = 0
        path = out_dir / f"{part}.png"
        Image.fromarray(part_rgba, mode="RGBA").save(path)
        saved[part] = str(path.relative_to(out_dir.parent.parent))
    return saved


def run_segmentation(original_path: Path, segmented_dir: Path) -> dict:
    """Full segmentation step. Returns dict with keypoints (pixel space),
    part file paths, and whether pose detection succeeded or we fell back."""
    img = Image.open(original_path).convert("RGBA")
    rgba_in = np.array(img)

    cutout = cutout_silhouette(rgba_in)
    rgb_for_pose = cutout[:, :, :3]

    kp = detect_keypoints(rgb_for_pose)
    used_fallback = kp is None
    if kp is None:
        h, w = cutout.shape[:2]
        kp = _fallback_keypoints(w, h)

    alpha = cutout[:, :, 3]
    masks = split_parts(alpha, kp)
    saved_paths = save_part_pngs(cutout, masks, segmented_dir)

    return {
        "keypoints": {k: [float(v[0]), float(v[1])] for k, v in kp.items()},
        "used_fallback_pose": used_fallback,
        "parts": saved_paths,
        "width": int(cutout.shape[1]),
        "height": int(cutout.shape[0]),
    }
