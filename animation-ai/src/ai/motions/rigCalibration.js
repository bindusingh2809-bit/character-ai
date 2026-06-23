/**
 * rigCalibration.js
 * ──────────────────
 * THE FIX for "wave goes the wrong way" (and every other mirrored/backwards
 * limb-rotation bug).
 *
 * THE BUG IN ONE SENTENCE:
 * The old motion library hardcoded "rotate the right arm by -90°" to mean
 * "raise it," assuming every rig draws its arms hanging straight down at
 * exactly 0° local rotation. Stretchy Studio's rig parts are flat 2D
 * cutout images rotated in absolute screen space around a pivot — there is
 * no universal angle that means "up." It depends entirely on how the
 * artist drew the limb relative to its pivot. A fixed angle is a guess
 * that is right for some rigs and exactly backwards for others (rotating
 * the arm inward across the chest instead of outward/upward) — which is
 * what you saw: right arm swinging toward the left hand.
 *
 * THE FIX:
 * Never hardcode "what angle means up." Instead, MEASURE it from the rig:
 *   1. Find the limb's pivot (shoulder) and its child joint (elbow, or
 *      hand/wrist if no elbow) in world space.
 *   2. That gives the limb's REST DIRECTION VECTOR — the way it actually
 *      hangs, in this specific rig's geometry.
 *   3. Every motion template asks for rotations in SEMANTIC terms
 *      ("point straight up", "point forward and out at 45°", "point
 *      sideways") instead of raw degrees. This module converts those
 *      semantic targets into the correct signed delta-rotation for this
 *      bone, in this rig, automatically — including correctly mirroring
 *      left vs. right.
 *
 * This makes the entire motion library "just work" on any rig, regardless
 * of art style, pivot placement, or whether the rigger drew arms hanging
 * down, akimbo, or already raised.
 */

/* ────────────────────────────────────────────────────────────────────────
 * Low-level geometry helpers
 * ──────────────────────────────────────────────────────────────────────── */

/** Radians → degrees */
const R2D = 180 / Math.PI;

/** Angle of vector (dx,dy) in degrees, screen space (+x right, +y DOWN). */
function vecAngleDeg(dx, dy) {
  return Math.atan2(dy, dx) * R2D;
}

/** Normalize an angle to (-180, 180]. */
export function normalizeAngle(deg) {
  let a = deg % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return a;
}

/** Shortest signed delta from `from` to `to`, in degrees. */
export function angleDelta(from, to) {
  return normalizeAngle(to - from);
}

/**
 * World-space position of a node's pivot, found by walking up the parent
 * chain and accumulating translation (rotation/scale of ancestors is
 * intentionally ignored here — pivots are authored in the same flat
 * "design space" project-wide for this rig format, matching how
 * armatureOrganizer assigns pivotX/pivotY). If a project later adds
 * rotated parent groups, swap this for a full matrix walk using
 * computeWorldMatrices from renderer/transforms.js.
 */
function worldPivot(nodesById, nodeId) {
  const node = nodesById.get(nodeId);
  if (!node) return null;
  const t = node.transform ?? {};
  return { x: t.pivotX ?? 0, y: t.pivotY ?? 0 };
}

/* ────────────────────────────────────────────────────────────────────────
 * Rig calibration
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * @typedef {Object} LimbCalibration
 * @property {string} boneId            nodeId of the rotating bone (e.g. shoulder group)
 * @property {number} restAngleDeg      the limb's actual rest direction in screen space
 *                                       (0° = pointing along +x/right, 90° = pointing straight
 *                                       down, -90° = pointing straight up, 180° = pointing left)
 * @property {1|-1} sign                +1 if increasing `rotation` sweeps the limb in the same
 *                                       rotational sense as increasing screen angle (clockwise);
 *                                       -1 if this rig/parent chain mirrors that (common when a
 *                                       parent group has negative scaleX for a mirrored left side)
 * @property {boolean} measured         true if derived from real geometry, false if it's a
 *                                       a best-effort fallback guess (no elbow/hand pivot found)
 */

/**
 * Measure a single limb's rest orientation from real rig geometry.
 *
 * @param {Map<string,object>} nodesById
 * @param {string|null} shoulderId   nodeId of the rotating bone (boneMap.rightArm etc.)
 * @param {string|null} childId      nodeId of the next joint down the chain
 *                                    (boneMap.rightElbow, falling back to a hand/foot bone)
 * @param {object} node              the shoulder node itself (for scaleX sign sniffing)
 * @returns {LimbCalibration|null}
 */
function measureLimb(nodesById, shoulderId, childId, fallbackRestAngleDeg) {
  if (!shoulderId) return null;

  const shoulderNode = nodesById.get(shoulderId);
  const shoulderPivot = worldPivot(nodesById, shoulderId);

  // Detect mirroring: if this bone or any ancestor has negative scaleX XOR
  // negative scaleY, a positive rotation visually sweeps the opposite way.
  let sign = 1;
  let walker = shoulderNode;
  let guard = 0;
  while (walker && guard++ < 64) {
    const sx = walker.transform?.scaleX ?? 1;
    const sy = walker.transform?.scaleY ?? 1;
    if (sx < 0) sign *= -1;
    if (sy < 0) sign *= -1;
    walker = walker.parent ? nodesById.get(walker.parent) : null;
  }

  if (childId && nodesById.has(childId) && shoulderPivot) {
    const childPivot = worldPivot(nodesById, childId);
    if (childPivot) {
      const dx = childPivot.x - shoulderPivot.x;
      const dy = childPivot.y - shoulderPivot.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.5) {
        return {
          boneId: shoulderId,
          restAngleDeg: vecAngleDeg(dx, dy),
          sign,
          measured: true,
        };
      }
    }
  }

  // No usable child joint (no elbow/hand mapped, or pivots coincide).
  // Fall back to a caller-supplied assumption, clearly marked unmeasured
  // so callers (and the UI) can warn the user that calibration is a guess
  // for this particular limb and offer a manual override.
  return {
    boneId: shoulderId,
    restAngleDeg: fallbackRestAngleDeg,
    sign,
    measured: false,
  };
}

/**
 * Build a full rig calibration from boneMap + the project's node list.
 * Call this once per project/rig (it's cheap) — e.g. memoized alongside
 * `resolveBoneMap` — and pass the result into every motion factory.
 *
 * @param {Record<string,string|null>} boneMap   role -> nodeId (from boneMapping.js)
 * @param {Array<object>} nodes                  project.nodes
 * @param {Record<string,number>} manualOverrides
 *        Optional per-role rest-angle overrides in degrees, screen space,
 *        same convention as restAngleDeg (0=right, 90=down, -90=up, 180=left).
 *        Use this for rigs where no elbow/hand bone exists at all, so
 *        calibration would otherwise have to guess. Persist alongside the
 *        project's boneMap overrides.
 * @returns {Record<string, LimbCalibration|null>}
 */
export function calibrateRig(boneMap, nodes, manualOverrides = {}) {
  const nodesById = new Map(nodes.map(n => [n.id, n]));

  // Fallback assumption used ONLY when a limb has no elbow/hand to measure
  // against: assume arms hang straight down, legs point straight down.
  // This is the same default the old code implicitly assumed everywhere —
  // but now it's an explicit, clearly-flagged fallback for ONE limb at a
  // time instead of a silent universal guess.
  const FALLBACK_REST_ANGLE = {
    leftArm: 90, rightArm: 90,   // hanging down
    leftLeg: 90, rightLeg: 90,   // hanging down
  };

  const pairs = [
    ['leftArm', 'leftElbow', 'leftHand'],
    ['rightArm', 'rightElbow', 'rightHand'],
    ['leftLeg', 'leftKnee', 'leftFoot'],
    ['rightLeg', 'rightKnee', 'rightFoot'],
  ];

  const calibration = {};

  for (const [boneRole, jointRole, distalRole] of pairs) {
    const boneId = boneMap[boneRole];
    if (!boneId) { calibration[boneRole] = null; continue; }

    if (boneRole in manualOverrides) {
      let sign = 1;
      let walker = nodesById.get(boneId);
      let guard = 0;
      while (walker && guard++ < 64) {
        const sx = walker.transform?.scaleX ?? 1;
        const sy = walker.transform?.scaleY ?? 1;
        if (sx < 0) sign *= -1;
        if (sy < 0) sign *= -1;
        walker = walker.parent ? nodesById.get(walker.parent) : null;
      }
      calibration[boneRole] = {
        boneId, restAngleDeg: manualOverrides[boneRole], sign, measured: true,
      };
      continue;
    }

    const childId = boneMap[jointRole] || boneMap[distalRole] || null;
    calibration[boneRole] = measureLimb(
      nodesById, boneId, childId, FALLBACK_REST_ANGLE[boneRole] ?? 90,
    );
  }

  // Head/body don't need direction calibration (their motions use small
  // relative offsets, not "point this limb at an absolute target angle"),
  // but we still surface mirroring sign for completeness/future use.
  for (const role of ['head', 'body', 'root']) {
    const boneId = boneMap[role];
    if (!boneId) { calibration[role] = null; continue; }
    let sign = 1;
    let walker = nodesById.get(boneId);
    let guard = 0;
    while (walker && guard++ < 64) {
      const sx = walker.transform?.scaleX ?? 1;
      const sy = walker.transform?.scaleY ?? 1;
      if (sx < 0) sign *= -1;
      if (sy < 0) sign *= -1;
      walker = walker.parent ? nodesById.get(walker.parent) : null;
    }
    calibration[role] = { boneId, restAngleDeg: 0, sign, measured: true };
  }

  return calibration;
}

/**
 * Convert a semantic "point this limb at absolute screen angle X" target
 * into the signed rotation DELTA to apply to the bone's CURRENT rotation
 * value, given its calibration.
 *
 * @param {LimbCalibration} calib
 * @param {number} targetAngleDeg   desired absolute pointing direction,
 *                                  screen space (0=right, 90=down, -90=up, 180=left)
 * @param {number} currentRotation  the bone's rotation value the delta is relative to
 *                                  (normally 0 if starting from rest pose)
 * @returns {number} rotation value to set on the bone (delta to add to currentRotation)
 */
export function rotationForTarget(calib, targetAngleDeg, currentRotation = 0) {
  if (!calib) return currentRotation;
  // The bone's CURRENT screen-space pointing angle, given its rest angle,
  // current rotation, and any mirroring sign.
  const currentScreenAngle = calib.restAngleDeg + calib.sign * currentRotation;
  const screenDelta = angleDelta(currentScreenAngle, targetAngleDeg);
  // Convert the screen-space delta back into bone-local rotation units.
  const localDelta = calib.sign * screenDelta;
  return currentRotation + localDelta;
}

/**
 * Convenience: rotation value that points a limb at a named compass-style
 * direction relative to the character facing the viewer.
 *   'up'        -> straight up           (-90°)
 *   'up_out'    -> raised diagonally out  (-45° away from body centerline)
 *   'forward'   -> pointing straight out/forward (0°, i.e. horizontal, away
 *                  from the body — sign-aware per side)
 *   'down_out'  -> lowered diagonally out (45° away from body)
 *   'down'      -> hanging straight down  (90°, i.e. rest)
 *   'across'    -> reaching across the body toward the other shoulder
 * @param {string} side 'left' | 'right'
 */
export function namedDirectionAngle(name, side) {
  switch (name) {
    case 'up':       return -90;                                // straight up
    case 'up_out':   return side === 'right' ? -45 : -135;       // raised, angled outward
    case 'forward':  return side === 'right' ? -10 : -170;       // ~horizontal, outward
    case 'down_out': return side === 'right' ? 45 : 135;         // lowered, angled outward
    case 'down':     return 90;                                  // hanging at rest
    case 'across':   return side === 'right' ? 135 : 45;         // reaching toward other shoulder
    default:         return 90;
  }
}

/**
 * Inspect a calibration result and return human-readable warnings for any
 * limb whose direction is an unmeasured guess (no elbow/hand bone mapped),
 * so the UI can tell the user "wave (right) may point the wrong way —
 * map a Right Elbow or Right Hand bone, or set a manual rest angle, to
 * fix this for your rig" instead of silently producing a wrong-looking
 * animation with no explanation, which is exactly how the original bug
 * went unnoticed.
 *
 * @param {Record<string, import('./rigCalibration').LimbCalibration|null>} calibration
 * @returns {Array<{role: string, message: string}>}
 */
export function getCalibrationWarnings(calibration) {
  const warnings = [];
  const LIMB_ROLES = ['leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
  for (const role of LIMB_ROLES) {
    const calib = calibration?.[role];
    if (calib && !calib.measured) {
      warnings.push({
        role,
        message:
          `"${role}" direction is a best-guess, not measured from your rig ` +
          `(no elbow/hand bone is mapped for it). Animations that raise or ` +
          `point this limb may go the wrong way. Map an elbow or hand bone ` +
          `for it, or set a manual rest-angle override, for accurate motion.`,
      });
    }
  }
  return warnings;
}
