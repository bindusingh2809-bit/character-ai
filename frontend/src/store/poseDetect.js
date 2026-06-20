// Auto-detects a starting skeleton from an uploaded character image using
// MediaPipe's Pose Landmarker, then maps the 33 detected landmarks onto
// YOUR bone format (root x/y + rotation/length relative to parent — see
// boneMath.js). The output is a plain `bones` array, the exact same shape
// `default_skeleton()` produces on the backend, so it drops straight into
// `loadFromSkeleton()`.
//
// MediaPipe gives absolute (x, y) per landmark in image space. Your bones
// are a rotation chain, so for every segment we do the same
// atan2/hypot math RiggingEditor.jsx already does interactively when you
// drag a bone's tip (see beginDrag -> kind === "end").

import {
  PoseLandmarker,
  FilesetResolver,
} from "@mediapipe/tasks-vision";
import { uid } from "./boneMath";

// MediaPipe's 33 pose landmark indices we care about.
// https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
const LM = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
};

// The bone template: each entry says "this bone runs from point A to point
// B, and is parented to the bone named `parent`". `root: true` bones get
// their own x/y; everything else is positioned relative to its parent tip,
// matching how addBone()/Bone already work.
//
// IMPORTANT: because child bones always start exactly at their parent's
// TIP (see boneMath.js — a child's start is always its parent's endX/endY),
// every bone's `from` point below MUST equal its parent's `to` point.
// That means a bone can only branch children from the point it ends at,
// never from its own start. So:
//   - `root` runs hip -> chest. Its tip (chest) is where the spine
//     continues and where the collar stubs branch toward each shoulder.
//   - The legs can't branch from root's tip (that's up at the chest) or
//     from root's start (chain math has no hook for that) — so each leg
//     gets its own tiny root-level bone seeded directly at the hip
//     landmark, parented to nothing (parent: null), matching how root
//     itself is seeded. They're independent root bones, not children of
//     the torso, which is fine: this is a starting rig to be refined, not
//     a strict single-skeleton requirement enforced anywhere else in the
//     app.
//
// Order matters: parents must be defined before children reference them.
function buildTemplate(points) {
  const midHip = midpoint(points[LM.LEFT_HIP], points[LM.RIGHT_HIP]);
  const midShoulder = midpoint(points[LM.LEFT_SHOULDER], points[LM.RIGHT_SHOULDER]);

  return [
    { name: "root", parent: null, from: midHip, to: midShoulder, root: true },
    { name: "head", parent: "root", from: midShoulder, to: points[LM.NOSE] },

    // collar stubs carry the chain from the chest out to each actual
    // shoulder socket, so the arm bone after them starts in the right
    // place instead of being silently dragged to the spine midline.
    { name: "collar_L", parent: "root", from: midShoulder, to: points[LM.LEFT_SHOULDER] },
    { name: "upper_arm_L", parent: "collar_L", from: points[LM.LEFT_SHOULDER], to: points[LM.LEFT_ELBOW] },
    { name: "lower_arm_L", parent: "upper_arm_L", from: points[LM.LEFT_ELBOW], to: points[LM.LEFT_WRIST] },

    { name: "collar_R", parent: "root", from: midShoulder, to: points[LM.RIGHT_SHOULDER] },
    { name: "upper_arm_R", parent: "collar_R", from: points[LM.RIGHT_SHOULDER], to: points[LM.RIGHT_ELBOW] },
    { name: "lower_arm_R", parent: "upper_arm_R", from: points[LM.RIGHT_ELBOW], to: points[LM.RIGHT_WRIST] },

    // legs are seeded as their own root-level bones starting at the hip
    // landmark (see note above on why they can't be children of `root`).
    { name: "upper_leg_L", parent: null, from: points[LM.LEFT_HIP], to: points[LM.LEFT_KNEE], root: true },
    { name: "lower_leg_L", parent: "upper_leg_L", from: points[LM.LEFT_KNEE], to: points[LM.LEFT_ANKLE] },

    { name: "upper_leg_R", parent: null, from: points[LM.RIGHT_HIP], to: points[LM.RIGHT_KNEE], root: true },
    { name: "lower_leg_R", parent: "upper_leg_R", from: points[LM.RIGHT_KNEE], to: points[LM.RIGHT_ANKLE] },
  ];
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

let landmarkerPromise = null;

// Lazily creates (and caches) the PoseLandmarker. Loads its model file
// from Google's CDN on first use — nothing to bundle or host yourself.
function getLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm"
      );
      return PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
          delegate: "GPU",
        },
        runningMode: "IMAGE",
        numPoses: 1,
      });
    })();
  }
  return landmarkerPromise;
}

/**
 * Detects a pose in `imageEl` (a loaded HTMLImageElement) and returns a
 * `bones` array in your editor's format, ready for loadFromSkeleton().
 *
 * Returns `null` if no person/pose was confidently detected — callers
 * should fall back to the existing single-root-bone default in that case.
 *
 * @param {HTMLImageElement} imageEl
 * @param {{ minVisibility?: number }} [opts]
 */
export async function detectBonesFromImage(imageEl, opts = {}) {
  const minVisibility = opts.minVisibility ?? 0.4;

  const landmarker = await getLandmarker();
  const result = landmarker.detect(imageEl);

  const landmarks = result?.landmarks?.[0];
  if (!landmarks || landmarks.length < 33) {
    return null;
  }

  // MediaPipe returns normalized [0,1] coords -> convert to image pixels,
  // since that's the space your bones (and the uploaded image) live in.
  const w = imageEl.naturalWidth || imageEl.width;
  const h = imageEl.naturalHeight || imageEl.height;
  const points = landmarks.map((lm) => ({
    x: lm.x * w,
    y: lm.y * h,
    visibility: lm.visibility,
  }));

  // Bail out if the core torso landmarks (everything else is anchored to
  // these) weren't confidently detected — a half-detected skeleton is
  // worse than no skeleton, since it can't be hand-fixed as easily as
  // starting fresh.
  const torsoConfidence = Math.min(
    points[LM.LEFT_SHOULDER].visibility ?? 0,
    points[LM.RIGHT_SHOULDER].visibility ?? 0,
    points[LM.LEFT_HIP].visibility ?? 0,
    points[LM.RIGHT_HIP].visibility ?? 0
  );
  if (torsoConfidence < minVisibility) {
    return null;
  }

  const template = buildTemplate(points);
  const idByName = {};
  const bonesByName = {};
  const bones = [];

  for (const seg of template) {
    // Each segment name maps to a fixed pair of underlying landmarks (see
    // segConfidenceFor), used to decide if this bone is reliable enough
    // to include even though root/head are built from midpoints.
    const conf = segConfidenceFor(seg.name, points);
    if (conf !== null && conf < minVisibility) continue; // skip unreliable limbs
    if (seg.parent && !idByName[seg.parent]) continue; // parent was skipped -> skip child too

    const dx = seg.to.x - seg.from.x;
    const dy = seg.to.y - seg.from.y;
    const worldRotation = Math.atan2(dy, dx);
    const length = Math.max(8, Math.hypot(dx, dy));

    let localRotation = worldRotation;
    if (seg.parent) {
      const parentBone = bonesByName[seg.parent];
      localRotation = worldRotation - parentBone.__worldRotation;
    }

    const bone = {
      id: uid(),
      name: seg.name,
      parent_id: seg.parent ? idByName[seg.parent] : null,
      x: seg.root ? seg.from.x : 0,
      y: seg.root ? seg.from.y : 0,
      rotation: localRotation,
      length,
      __worldRotation: worldRotation, // stripped before returning
    };

    idByName[seg.name] = bone.id;
    bonesByName[seg.name] = bone;
    bones.push(bone);
  }

  if (bones.length === 0) return null;

  // strip the temp field used for chaining math above
  return bones.map(({ __worldRotation, ...b }) => b);
}

function segConfidenceFor(name, points) {
  const pair = {
    root: [LM.LEFT_HIP, LM.RIGHT_HIP, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER],
    head: [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.NOSE],
    collar_L: [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER],
    upper_arm_L: [LM.LEFT_SHOULDER, LM.LEFT_ELBOW],
    lower_arm_L: [LM.LEFT_ELBOW, LM.LEFT_WRIST],
    collar_R: [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER],
    upper_arm_R: [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW],
    lower_arm_R: [LM.RIGHT_ELBOW, LM.RIGHT_WRIST],
    upper_leg_L: [LM.LEFT_HIP, LM.LEFT_KNEE],
    lower_leg_L: [LM.LEFT_KNEE, LM.LEFT_ANKLE],
    upper_leg_R: [LM.RIGHT_HIP, LM.RIGHT_KNEE],
    lower_leg_R: [LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
  }[name];
  if (!pair) return null;
  return Math.min(...pair.map((i) => points[i].visibility ?? 1));
}