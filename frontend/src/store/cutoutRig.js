// Builds a "cutout puppet" from the single uploaded character texture: one
// rectangular crop per limb bone, each posed (position + rotation) by its
// bone's world transform every frame, so rotating lower_arm_R actually
// drags a piece of the source image with it instead of leaving the
// artwork static under a separate bone-line overlay.
//
// This is the auto-crop approach: boxes are derived purely from bone
// geometry on the *existing* source image, not hand-cut layered assets.
// Tradeoff (acknowledged): cutout edges are rectangular, so seams and
// minor bleed from neighboring limbs are expected, especially at
// shoulder/hip/elbow joints. Good enough as a first pass without
// changing the upload pipeline; mesh-based deformation is the upgrade
// path if/when seam quality becomes a problem.

import * as PIXI from "pixi.js";
import { buildWorldTransforms } from "./boneMath";

// Which bones get a cutout sprite, in back-to-front draw order. Bones not
// listed here (anything auto-detect didn't produce, or custom manual
// bones) simply don't get a cutout — they stay invisible/skeleton-only,
// same as today.
//
// Order matters: torso underneath, then limbs, with the "far" side limbs
// drawn first so the "near" side overlaps them at the center -- a cheap
// approximation of correct draw order for a roughly front-facing pose.
export const CUTOUT_LAYER_ORDER = [
  "root", // torso: hip -> chest
  "pelvis_R", // (kept for forward-compat if older detections produced it)
  "pelvis_L",
  "upper_leg_R",
  "upper_leg_L",
  "lower_leg_R",
  "lower_leg_L",
  "collar_R",
  "collar_L",
  "upper_arm_R",
  "upper_arm_L",
  "lower_arm_R",
  "lower_arm_L",
  "head",
];

// How far past the bone's own line the crop box extends, as a fraction of
// the bone's length. Limbs are wider than the bone line itself (a real
// arm has thickness), so we pad outward; tune per-bone since arms/legs
// vs. torso/head need different proportions.
const PADDING_BY_BONE = {
  root: { along: 0.15, across: 0.55 }, // torso is wide
  head: { along: 0.35, across: 0.55 }, // head is roughly round
  collar_L: { along: 0.4, across: 0.35 },
  collar_R: { along: 0.4, across: 0.35 },
  upper_arm_L: { along: 0.15, across: 0.28 },
  upper_arm_R: { along: 0.15, across: 0.28 },
  lower_arm_L: { along: 0.15, across: 0.24 },
  lower_arm_R: { along: 0.15, across: 0.24 },
  upper_leg_L: { along: 0.1, across: 0.3 },
  upper_leg_R: { along: 0.1, across: 0.3 },
  lower_leg_L: { along: 0.1, across: 0.26 },
  lower_leg_R: { along: 0.1, across: 0.26 },
};
const DEFAULT_PADDING = { along: 0.2, across: 0.3 };

/**
 * Computes an axis-aligned crop rect (in source-image pixel space) for one
 * bone, padded outward from its start/end line so it actually covers the
 * limb's visible width, not just the bone's centerline.
 */
function cropRectForBone(bone, transform, imageWidth, imageHeight) {
  const pad = PADDING_BY_BONE[bone.name] ?? DEFAULT_PADDING;
  const { startX, startY, endX, endY } = transform;
  const length = Math.max(8, Math.hypot(endX - startX, endY - startY));

  const alongPad = length * pad.along;
  const acrossPad = length * pad.across;

  const minX = Math.min(startX, endX) - acrossPad - alongPad * 0.3;
  const maxX = Math.max(startX, endX) + acrossPad + alongPad * 0.3;
  const minY = Math.min(startY, endY) - acrossPad - alongPad * 0.3;
  const maxY = Math.max(startY, endY) + acrossPad + alongPad * 0.3;

  // clamp to image bounds and round to integer pixels (PIXI texture
  // frames need integer rects)
  const x = Math.max(0, Math.floor(minX));
  const y = Math.max(0, Math.floor(minY));
  const right = Math.min(imageWidth, Math.ceil(maxX));
  const bottom = Math.min(imageHeight, Math.ceil(maxY));
  const width = Math.max(1, right - x);
  const height = Math.max(1, bottom - y);

  return { x, y, width, height };
}

/**
 * Builds (or rebuilds) one PIXI.Sprite per cutout-eligible bone from a
 * single base texture. Each sprite's texture is a *cropped view* of the
 * same base texture (no extra image decode/upload — cheap), with its
 * anchor set so the sprite's pivot sits exactly at the bone's start
 * joint, matching how the bone itself rotates around its start.
 *
 * Returns a Map<boneId, { sprite, cropRect, pivotOffset }> for use by
 * updateCutoutTransforms() every frame/redraw.
 */
export function buildCutoutSprites(baseTexture, bones, imageWidth, imageHeight) {
  const byName = Object.fromEntries(bones.map((b) => [b.name, b]));
  const transforms = buildWorldTransforms(bones);
  const sprites = new Map();

  CUTOUT_LAYER_ORDER.forEach((name) => {
    const bone = byName[name];
    if (!bone) return; // this bone wasn't detected/doesn't exist on this rig
    const t = transforms[bone.id];
    if (!t) return;

    const rect = cropRectForBone(bone, t, imageWidth, imageHeight);
    const frame = new PIXI.Rectangle(rect.x, rect.y, rect.width, rect.height);
    const texture = new PIXI.Texture(baseTexture, frame);

    const sprite = new PIXI.Sprite(texture);
    sprite.eventMode = "none";

    // Anchor at the bone's start joint, expressed as a fraction of the
    // crop rect so PIXI's built-in anchor (0..1) handles the pivot math.
    const pivotXInRect = (t.startX - rect.x) / rect.width;
    const pivotYInRect = (t.startY - rect.y) / rect.height;
    sprite.anchor.set(pivotXInRect, pivotYInRect);

    sprites.set(bone.id, { sprite, rect });
  });

  return sprites;
}

/**
 * Repositions/rotates already-built cutout sprites to match current bone
 * transforms. Call this every time bones change (drag, rotation input,
 * etc.) without rebuilding crop rects/textures — cheap, just a
 * position+rotation update per sprite.
 */
export function updateCutoutTransforms(cutouts, bones) {
  const transforms = buildWorldTransforms(bones);
  cutouts.forEach(({ sprite, rect }, boneId) => {
    const t = transforms[boneId];
    if (!t) return;
    sprite.position.set(t.startX, t.startY);
    sprite.rotation = t.worldRotation;
  });
}

/** Destroys all sprites in a cutout map (texture: false — shares the base texture, don't free it). */
export function destroyCutoutSprites(cutouts) {
  cutouts.forEach(({ sprite }) => {
    sprite.destroy({ children: true, texture: false, baseTexture: false });
  });
  cutouts.clear();
}
