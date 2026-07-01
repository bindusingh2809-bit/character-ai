import { track, repeatCycle, motionResult, followThrough, anticipateActionSettle, EASE } from './motionUtils';
import { rotationForTarget, namedDirectionAngle } from './rigCalibration';

/**
 * Each createXMotion(boneMap, calibration, opts) returns { tracks, duration }.
 *
 * `boneMap`        role -> nodeId               (from boneMapping.resolveBoneMap)
 * `calibration`    role -> LimbCalibration|null  (from rigCalibration.calibrateRig)
 * `opts.duration`  ms, scales the motion
 * `opts.side`      picks left/right
 * `opts.count`     repeats cyclic motions (jump, wave, nod, clap...)
 *
 * WHY `calibration` IS NEW AND REQUIRED:
 * Limb motions ("raise the arm", "lift the leg") used to bake in a fixed
 * rotation angle (e.g. -90°) and assume every rig's limb hangs at local
 * rotation 0 in exactly the same screen direction. That assumption breaks
 * the moment a rig's art doesn't match it — which is exactly what produced
 * the "wave goes toward the other hand" bug. Now every directional motion
 * asks rigCalibration for the actual delta needed to point this rig's limb
 * at a semantic target ("up", "forward", "across", ...), so the same
 * template works correctly no matter how the limb was originally drawn.
 *
 * Motions that don't need absolute pointing directions (idle breathing,
 * head nods, claps measured as relative offsets) still work fine without
 * calibration, but it's threaded through everywhere for consistency and
 * because clap/dance benefit from sign-correct mirroring too.
 */

const DEFAULT_DURATION = 1000;

function sideRole(base, side) {
  return side === 'left' ? `left${base}` : `right${base}`;
}

/** Safe calibration lookup; never throws if a role wasn't mapped/measured. */
function calibFor(calibration, role) {
  return calibration?.[role] ?? null;
}

/**
 * Core helper used by every "point this limb at a named direction" motion.
 * Returns the rotation VALUE (not delta) to reach that semantic direction,
 * correctly signed/mirrored for this rig and this side.
 */
function targetRotation(calibration, role, side, directionName, currentRotation = 0) {
  const calib = calibFor(calibration, role);
  if (!calib) return currentRotation;
  const targetAngle = namedDirectionAngle(directionName, side);
  return rotationForTarget(calib, targetAngle, currentRotation);
}

// ── Idle / breathing ─────────────────────────────────────────────────────
// Principle: Secondary Action + Timing. A character is never perfectly
// still — idle breathing sells "alive" before any explicit action plays.
export function createIdleMotion(boneMap, calibration, opts = {}) {
  const duration = opts.duration ?? 1600;
  const tracks = [];
  if (boneMap.body) {
    tracks.push(track(boneMap.body, 'y', [
      [0, 0, EASE.EASE_BOTH], [duration / 2, -3, EASE.EASE_BOTH], [duration, 0, EASE.EASE_BOTH],
    ]));
  }
  if (boneMap.head) {
    // Subtle secondary sway so the head doesn't look welded to the body.
    tracks.push(track(boneMap.head, 'rotation', [
      [0, 0, EASE.EASE_BOTH], [duration / 2, 1.5, EASE.EASE_BOTH], [duration, 0, EASE.EASE_BOTH],
    ]));
  }
  return motionResult(tracks, duration);
}

// ── Walk / Run ───────────────────────────────────────────────────────────
// Principles: Arcs (limbs swing through curved paths, approximated here by
// opposite-phase rotation pairs), Timing (run = faster cycle, more bob),
// Exaggeration (run's bigger step angle and bob amount).
//
// This is an IN-PLACE gait cycle on purpose: the root never translates.
// An earlier version moved root.x across the canvas to sell "travel," but
// that meant the character visibly slid/snapped instead of just walking on
// the spot — wrong for a puppet that's meant to stay where it's placed. If
// on-screen travel is ever wanted, layer a separate position tween on top
// of this clip rather than baking movement into the gait itself.
//
// A believable in-place 2D walk on a front-facing puppet still needs:
//   1. TURN — head and body rotate a few degrees toward the faced
//      direction so the pose commits to "facing that way" instead of
//      staring at the camera. (We deliberately do NOT mirror the whole rig
//      via root.scaleX=-1 for this — that would invert every limb's
//      calibrated rotation sign for the rest of the timeline, since
//      rigCalibration measures sign once at rest. A small head/body lean
//      sells direction without that side effect.)
//   2. STRIDE — legs alternate (one forward while the other is back, with
//      a brief lift) instead of mirroring each other symmetrically.
//   3. SYNCED ARM SWING — arms counter-swing opposite their same-side leg,
//      using the exact same quarter-cycle keyframe grid as the legs (not
//      just matching extremes) so both limbs share identical easing
//      segments and read as one connected motion instead of drifting.
//
// `opts.side` is reused as the facing direction ('right' = faces
// screen-right, the default; 'left' = faces screen-left) — no new schema
// field needed, since the LLM/UI already produce `side`.
function gaitMotion(boneMap, calibration, opts, { stepDeg, bobAmount, cycleMs, liftDeg, turnDeg, kneeBendDeg, elbowBendDeg }) {
  const explicitCount = opts.count != null && opts.count > 0;
  const duration = opts.duration ?? (explicitCount ? opts.count * cycleMs : DEFAULT_DURATION * 2);
  const cycles = explicitCount ? opts.count : Math.max(1, Math.round(duration / cycleMs));
  const dir = opts.side === 'left' ? -1 : 1; // +1 = faces screen-right
  const tracks = [];

  // ── 1. TURN toward facing direction ──────────────────────────────────
  // Small, calibration-safe absolute offsets — not a full mirror — so this
  // never interacts with rigCalibration's measured rotation signs.
  // turnInMs/turnOutMs are clamped so the "hold" keyframe never lands
  // before the "turn in" keyframe even for very short durations.
  const turnInMs = Math.min(180, duration / 3);
  const turnOutStart = Math.max(turnInMs, duration - 180);
  if (boneMap.body) {
    tracks.push(track(boneMap.body, 'rotation', [
      [0, 0, EASE.EASE_OUT], [turnInMs, dir * turnDeg, EASE.EASE_BOTH],
      [turnOutStart, dir * turnDeg, EASE.EASE_BOTH], [duration, 0, EASE.EASE_IN],
    ]));
  }
  if (boneMap.head) {
    tracks.push(track(boneMap.head, 'rotation', [
      [0, 0, EASE.EASE_OUT], [turnInMs, dir * turnDeg * 1.4, EASE.EASE_BOTH],
      [turnOutStart, dir * turnDeg * 1.4, EASE.EASE_BOTH], [duration, 0, EASE.EASE_IN],
    ]));
  }

  // ── 2. STRIDE: legs alternate contact/passing/lift instead of a
  // symmetric scissor. Each leg's cycle: back (contact) -> forward
  // (contact), with a brief upward lift (negative rotation bias) during
  // its "swing" half so it visually clears the ground between steps.
  if (boneMap.leftLeg) {
    tracks.push(track(boneMap.leftLeg, 'rotation', repeatCycle(
      [
        [0, -stepDeg],                       // leg back (push-off / contact)
        [cycleMs * 0.25, -liftDeg],           // swinging through, lifted
        [cycleMs * 0.5, stepDeg],             // leg forward (contact)
        [cycleMs * 0.75, stepDeg * 0.3],      // brief hold/roll before push-off
        [cycleMs, -stepDeg],
      ], cycleMs, cycles,
    ), EASE.EASE_BOTH));
  }
  if (boneMap.rightLeg) {
    // Exactly half a cycle out of phase with the left leg, same shape.
    tracks.push(track(boneMap.rightLeg, 'rotation', repeatCycle(
      [
        [0, stepDeg],
        [cycleMs * 0.25, stepDeg * 0.3],
        [cycleMs * 0.5, -stepDeg],
        [cycleMs * 0.75, -liftDeg],
        [cycleMs, stepDeg],
      ], cycleMs, cycles,
    ), EASE.EASE_BOTH));
  }
  // ── 2b. KNEE BEND — the lower leg is a CHILD bone of leftLeg/rightLeg,
  // so its rotation here is RELATIVE to the thigh, not absolute. A real
  // walking knee is nearly straight at both footfalls (heel-strike and
  // toe-off) and flexes hardest during the SWING half of that same leg's
  // own cycle, so the shin/foot clears the ground instead of dragging
  // through it in a straight line. Each knee's bend peak is placed at
  // exactly the timestamp where that leg's own track already dips to
  // `-liftDeg` (its swing-through moment) — left swings at 0.25, right at
  // 0.75, matching the phase offset already established above — plus a
  // much smaller secondary flex during stance/push-off so the leg isn't
  // robotically locked the rest of the cycle either.
  const kneeBend = kneeBendDeg ?? liftDeg * 2.2;
  if (boneMap.leftKnee) {
    tracks.push(track(boneMap.leftKnee, 'rotation', repeatCycle(
      [
        [0, 0],                       // contact (leg back) — straight
        [cycleMs * 0.25, kneeBend],   // swing-through — max bend to clear ground
        [cycleMs * 0.5, 0],           // contact (leg forward) — straight
        [cycleMs * 0.75, kneeBend * 0.15], // stance/push-off — slight flex
        [cycleMs, 0],
      ], cycleMs, cycles,
    ), EASE.EASE_BOTH));
  }
  if (boneMap.rightKnee) {
    // Same shape, offset half a cycle to match rightLeg's own swing (0.75).
    tracks.push(track(boneMap.rightKnee, 'rotation', repeatCycle(
      [
        [0, 0],
        [cycleMs * 0.25, kneeBend * 0.15],
        [cycleMs * 0.5, 0],
        [cycleMs * 0.75, kneeBend],
        [cycleMs, 0],
      ], cycleMs, cycles,
    ), EASE.EASE_BOTH));
  }

  // Arms swing opposite their same-side leg (natural counter-swing), on
  // the SAME 0/0.25/0.5/0.75/cycle keyframe grid as the legs above — not
  // just matching peak values at t=0 and t=cycle/2. Previously the arms
  // only had 2 keyframe segments per cycle (a plain half-cycle swing)
  // while the legs had 4 uneven segments (contact/swing/contact/roll), so
  // even though the extremes lined up in time, the eased velocity curves
  // didn't — the arms visibly lagged/floated relative to the legs' snappier
  // stride. Adding explicit zero-crossing keyframes at the same 0.25/0.75
  // timestamps the legs already use locks both limbs to identical easing
  // segments so they read as one connected motion.
  const armFwd = stepDeg * 0.55;
  if (boneMap.leftArm) {
    tracks.push(track(boneMap.leftArm, 'rotation', repeatCycle(
      [
        [0, armFwd],                 // forward — pairs with rightLeg forward
        [cycleMs * 0.25, 0],
        [cycleMs * 0.5, -armFwd],    // back — pairs with rightLeg back
        [cycleMs * 0.75, 0],
        [cycleMs, armFwd],
      ], cycleMs, cycles,
    ), EASE.EASE_BOTH));
  }
  if (boneMap.rightArm) {
    // Exact mirror of leftArm, so right arm forward always coincides with
    // leftLeg forward (contralateral swing), matching a natural gait.
    tracks.push(track(boneMap.rightArm, 'rotation', repeatCycle(
      [
        [0, -armFwd],
        [cycleMs * 0.25, 0],
        [cycleMs * 0.5, armFwd],
        [cycleMs * 0.75, 0],
        [cycleMs, -armFwd],
      ], cycleMs, cycles,
    ), EASE.EASE_BOTH));
  }

  // ── 2c. ELBOW BEND — same idea as the knee: the forearm is a CHILD of
  // leftArm/rightArm, so this rotation is relative to the upper arm, not
  // absolute. A swinging arm flexes slightly at the elbow as it comes
  // forward (so the hand doesn't overshoot ahead of the body on too long
  // an "arc") and straightens as it swings back. leftArm's forward extreme
  // is its t=0/cycle value (+armFwd); rightArm's forward extreme is at
  // cycleMs/2 (+armFwd) — i.e. each elbow bends most exactly when its
  // own arm track is at its positive (forward) peak, and straightens at the
  // negative (back) peak, the same phase relationship a real arm swing has.
  const elbowBend = elbowBendDeg ?? stepDeg * 0.5;
  if (boneMap.leftElbow) {
    tracks.push(track(boneMap.leftElbow, 'rotation', repeatCycle(
      [[0, elbowBend], [cycleMs / 2, 0], [cycleMs, elbowBend]], cycleMs, cycles,
    ), EASE.EASE_BOTH));
  }
  if (boneMap.rightElbow) {
    tracks.push(track(boneMap.rightElbow, 'rotation', repeatCycle(
      [[0, 0], [cycleMs / 2, elbowBend], [cycleMs, 0]], cycleMs, cycles,
    ), EASE.EASE_BOTH));
  }

  // Body/head bob — two bounces per cycle (one per footfall), in addition
  // to the turn rotation tracks above (different property, so they layer).
  if (boneMap.body) {
    tracks.push(track(boneMap.body, 'y', repeatCycle(
      [[0, 0], [cycleMs / 4, -bobAmount], [cycleMs / 2, 0], [(3 * cycleMs) / 4, -bobAmount], [cycleMs, 0]],
      cycleMs, cycles,
    ), EASE.EASE_BOTH));
  }
  if (boneMap.head) {
    tracks.push(track(boneMap.head, 'y', repeatCycle(
      [[0, 0], [cycleMs / 4, -bobAmount * 0.4], [cycleMs / 2, 0], [(3 * cycleMs) / 4, -bobAmount * 0.4], [cycleMs, 0]],
      cycleMs, cycles,
    ), EASE.EASE_BOTH));
  }
  return motionResult(tracks, cycles * cycleMs);
}

export function createWalkMotion(boneMap, calibration, opts = {}) {
  return gaitMotion(boneMap, calibration, opts, {
    stepDeg: 18, bobAmount: 4, cycleMs: 600, liftDeg: 10, turnDeg: 8,
    kneeBendDeg: 28, elbowBendDeg: 12,
  });
}

export function createRunMotion(boneMap, calibration, opts = {}) {
  return gaitMotion(boneMap, calibration, opts, {
    stepDeg: 32, bobAmount: 8, cycleMs: 360, liftDeg: 22, turnDeg: 12,
    kneeBendDeg: 55, elbowBendDeg: 24,
  });
}

// ── Jump ─────────────────────────────────────────────────────────────────
// Principles: Anticipation (crouch/arm-pull before liftoff), Squash-and-
// -Stretch-adjacent (body y dips before launch), Follow-through (legs
// trail on landing), Slow-in/Slow-out (eased liftoff/landing).
export function createJumpMotion(boneMap, calibration, opts = {}) {
  const count = opts.count ?? 1;
  const jumpMs = opts.duration ? Math.round(opts.duration / count) : 650;
  const tracks = [];
  const liftHeight = 60;
  const crouchMs = jumpMs * 0.18;
  const riseMs = jumpMs * 0.32;
  const fallMs = jumpMs * 0.32;
  const landMs = jumpMs - crouchMs - riseMs - fallMs;

  if (boneMap.root || boneMap.body) {
    const target = boneMap.root ?? boneMap.body;
    tracks.push(track(target, 'y', repeatCycle(
      [
        [0, 0, EASE.EASE_OUT],
        [crouchMs, 8, EASE.EASE_IN],            // anticipation: dip down first
        [crouchMs + riseMs, -liftHeight, EASE.EASE_OUT],
        [crouchMs + riseMs + fallMs, -liftHeight * 0.15, EASE.EASE_IN],
        [jumpMs, 0, EASE.EASE_BOTH],            // landing settle
      ], jumpMs, count,
    )));
  }
  if (boneMap.leftLeg) {
    tracks.push(track(boneMap.leftLeg, 'rotation', repeatCycle(
      [[0, 0], [crouchMs, 18], [crouchMs + riseMs, -22], [crouchMs + riseMs + fallMs, 8], [jumpMs, 0]],
      jumpMs, count,
    ), EASE.EASE_BOTH));
  }
  if (boneMap.rightLeg) {
    tracks.push(track(boneMap.rightLeg, 'rotation', repeatCycle(
      [[0, 0], [crouchMs, -18], [crouchMs + riseMs, 22], [crouchMs + riseMs + fallMs, -8], [jumpMs, 0]],
      jumpMs, count,
    ), EASE.EASE_BOTH));
  }
  // Arms swing back (anticipation) then up for momentum — using calibrated
  // "up" / "down_out" directions so this works regardless of rig art.
  if (boneMap.leftArm) {
    const up = targetRotation(calibration, 'leftArm', 'left', 'up');
    const back = targetRotation(calibration, 'leftArm', 'left', 'down_out');
    tracks.push(track(boneMap.leftArm, 'rotation', repeatCycle(
      [[0, 0], [crouchMs, back], [crouchMs + riseMs, up], [jumpMs, 0]], jumpMs, count,
    ), EASE.EASE_BOTH));
  }
  if (boneMap.rightArm) {
    const up = targetRotation(calibration, 'rightArm', 'right', 'up');
    const back = targetRotation(calibration, 'rightArm', 'right', 'down_out');
    tracks.push(track(boneMap.rightArm, 'rotation', repeatCycle(
      [[0, 0], [crouchMs, back], [crouchMs + riseMs, up], [jumpMs, 0]], jumpMs, count,
    ), EASE.EASE_BOTH));
  }
  return motionResult(tracks, jumpMs * count);
}

// ── Wave ─────────────────────────────────────────────────────────────────
// THIS IS THE MOTION THAT WAS BROKEN. Fixed by using calibrated rotation
// targets instead of a hardcoded ±90°. Principles applied: Anticipation
// (small wind-up before the raise), Slow-in/Slow-out (eased raise),
// Follow-through (hand/forearm lags the upper arm slightly via
// followThrough()), Exaggeration (the oscillation overshoots a touch wider
// on the first swing), Timing (oscillation speeds up very slightly like a
// real wave settling into rhythm).
export function createWaveMotion(boneMap, calibration, opts = {}) {
  const side = opts.side ?? 'right';
  const arm = boneMap[sideRole('Arm', side)];
  const hand = boneMap[sideRole('Hand', side)];
  const cycleMs = 320;
  const count = opts.count ?? Math.max(2, Math.round((opts.duration ?? 1400) / cycleMs));
  const tracks = [];
  if (!arm) return motionResult(tracks, 0);

  const calib = calibFor(calibration, sideRole('Arm', side));
  // Resolve the actual rotation value needed to point this rig's arm
  // "up and out" (raised, ready to wave) — derived from THIS rig's
  // measured shoulder→elbow geometry, not assumed. If this limb couldn't
  // be measured (no elbow/hand mapped for it), calib.measured will be
  // false and rotationForTarget still returns its best estimate using the
  // fallback rest angle — callers should surface getCalibrationWarnings()
  // to the user in that case so they know to double check this motion.
  const raised = calib
    ? rotationForTarget(calib, namedDirectionAngle('up_out', side), 0)
    : (side === 'right' ? -90 : 90); // only reached if the role has no
                                       // bone mapped at all (arm is null,
                                       // already guarded above) — kept as
                                       // an inert final fallback.
  // Oscillate symmetrically around the raised pose. The oscillation must
  // swing in the SAME rotational sense as the raise itself, which is what
  // calib.sign encodes — without it, a mirrored rig would wave by twisting
  // away from "up" on one half of the cycle instead of swaying around it.
  const swing = calib ? 18 * calib.sign : 18;
  const waveA = raised - swing;
  const waveB = raised + swing;

  const liftMs = 150;
  const settleMs = 80;
  const startTime = liftMs + settleMs;

  // Anticipation: tiny dip the wrong way before raising, then ease into the
  // lift with a slight overshoot before settling at the raised hold pose.
  const liftKfs = anticipateActionSettle(0, raised, {
    anticipation: -6,
    overshoot: 10,
    anticipateMs: 70,
    actionMs: liftMs - 70,
    settleMs,
  });

  const oscillation = repeatCycle(
    [[0, raised], [cycleMs / 2, waveA], [cycleMs, waveB]],
    cycleMs, count,
  ).map(([t, v]) => [t + startTime, v]);

  const endTime = startTime + count * cycleMs;
  const returnKfs = [
    [endTime, raised, EASE.EASE_OUT],
    [endTime + 150, 0, EASE.EASE_BOTH],
  ];

  tracks.push(track(arm, 'rotation', [...liftKfs, ...oscillation, ...returnKfs]));

  // Secondary action / follow-through: if a hand bone exists separately
  // from the forearm/shoulder, let it trail the wave with reduced
  // amplitude so the motion doesn't read as one rigid stick.
  if (hand) {
    const handKfs = followThrough(oscillation, 40, 0.35);
    tracks.push(track(hand, 'rotation', [
      [0, 0],
      ...followThrough(liftKfs, 40, 0.35),
      ...handKfs,
      [endTime + 40, 0, EASE.EASE_OUT],
      [endTime + 190, 0, EASE.EASE_BOTH],
    ]));
  }

  return motionResult(tracks, endTime + 150);
}

// ── Point ────────────────────────────────────────────────────────────────
// Principles: Anticipation (brief pull-back), Staging (clear, held target
// pose so the gesture reads), Slow-in/Slow-out.
export function createPointMotion(boneMap, calibration, opts = {}) {
  const side = opts.side ?? 'right';
  const arm = boneMap[sideRole('Arm', side)];
  const duration = opts.duration ?? 1200;
  const tracks = [];
  if (!arm) return motionResult(tracks, duration);

  const target = targetRotation(calibration, sideRole('Arm', side), side, 'forward');
  const kfs = anticipateActionSettle(0, target, {
    anticipation: -8,
    overshoot: target * 0.08,
    anticipateMs: 120,
    actionMs: 130,
    settleMs: 90,
    holdMs: Math.max(0, duration - 120 - 130 - 90 - 250),
    returnToRest: true,
    returnMs: 250,
  });
  tracks.push(track(arm, 'rotation', kfs));
  return motionResult(tracks, duration);
}

// ── Clap ─────────────────────────────────────────────────────────────────
// Principles: Timing (sharp, quick claps), Exaggeration (wide swing-in),
// Slow-in/Slow-out per clap.
export function createClapMotion(boneMap, calibration, opts = {}) {
  const cycleMs = 260;
  const count = opts.count ?? Math.max(2, Math.round((opts.duration ?? 1200) / cycleMs));
  const tracks = [];
  if (boneMap.leftArm) {
    const across = targetRotation(calibration, 'leftArm', 'left', 'across');
    const out = targetRotation(calibration, 'leftArm', 'left', 'forward');
    tracks.push(track(boneMap.leftArm, 'rotation', repeatCycle(
      [[0, out], [cycleMs * 0.35, across], [cycleMs, out]], cycleMs, count,
    ), EASE.EASE_OUT));
  }
  if (boneMap.rightArm) {
    const across = targetRotation(calibration, 'rightArm', 'right', 'across');
    const out = targetRotation(calibration, 'rightArm', 'right', 'forward');
    tracks.push(track(boneMap.rightArm, 'rotation', repeatCycle(
      [[0, out], [cycleMs * 0.35, across], [cycleMs, out]], cycleMs, count,
    ), EASE.EASE_OUT));
  }
  return motionResult(tracks, count * cycleMs);
}

// ── Dance ────────────────────────────────────────────────────────────────
// Principles: Exaggeration, Arcs (body sway + bounce together), Secondary
// Action (arms swing opposite phase from body for a livelier silhouette).
export function createDanceMotion(boneMap, calibration, opts = {}) {
  const cycleMs = 400;
  const duration = opts.duration ?? 2400;
  const count = Math.max(1, Math.round(duration / cycleMs));
  const tracks = [];
  if (boneMap.body) {
    tracks.push(track(boneMap.body, 'rotation', repeatCycle(
      [[0, -8], [cycleMs / 2, 8], [cycleMs, -8]], cycleMs, count,
    ), EASE.EASE_BOTH));
  }
  if (boneMap.leftArm) {
    const up = targetRotation(calibration, 'leftArm', 'left', 'up_out');
    const down = targetRotation(calibration, 'leftArm', 'left', 'down_out');
    tracks.push(track(boneMap.leftArm, 'rotation', repeatCycle(
      [[0, down], [cycleMs / 2, up], [cycleMs, down]], cycleMs, count,
    ), EASE.EASE_BOTH));
  }
  if (boneMap.rightArm) {
    const up = targetRotation(calibration, 'rightArm', 'right', 'up_out');
    const down = targetRotation(calibration, 'rightArm', 'right', 'down_out');
    tracks.push(track(boneMap.rightArm, 'rotation', repeatCycle(
      [[0, up], [cycleMs / 2, down], [cycleMs, up]], cycleMs, count,
    ), EASE.EASE_BOTH));
  }
  if (boneMap.root) {
    tracks.push(track(boneMap.root, 'y', repeatCycle(
      [[0, 0], [cycleMs / 2, -10], [cycleMs, 0]], cycleMs, count,
    ), EASE.EASE_BOTH));
  }
  if (boneMap.head) {
    tracks.push(track(boneMap.head, 'rotation', repeatCycle(
      [[0, 5], [cycleMs / 2, -5], [cycleMs, 5]], cycleMs, count,
    ), EASE.EASE_BOTH));
  }
  return motionResult(tracks, count * cycleMs);
}

// ── Celebrate ────────────────────────────────────────────────────────────
// Principles: Anticipation, Exaggeration (both arms thrown fully "up"),
// Follow-through (a little bounce settle), Staging (clean held pose).
export function createCelebrateMotion(boneMap, calibration, opts = {}) {
  const duration = opts.duration ?? 1400;
  const tracks = [];
  if (boneMap.leftArm) {
    const up = targetRotation(calibration, 'leftArm', 'left', 'up');
    tracks.push(track(boneMap.leftArm, 'rotation', anticipateActionSettle(0, up, {
      anticipation: -10, overshoot: 14, anticipateMs: 100, actionMs: 130, settleMs: 90,
      holdMs: Math.max(0, duration - 100 - 130 - 90 - 220), returnToRest: true, returnMs: 220,
    })));
  }
  if (boneMap.rightArm) {
    const up = targetRotation(calibration, 'rightArm', 'right', 'up');
    tracks.push(track(boneMap.rightArm, 'rotation', anticipateActionSettle(0, up, {
      anticipation: -10, overshoot: 14, anticipateMs: 100, actionMs: 130, settleMs: 90,
      holdMs: Math.max(0, duration - 100 - 130 - 90 - 220), returnToRest: true, returnMs: 220,
    })));
  }
  if (boneMap.root) {
    tracks.push(track(boneMap.root, 'y', [
      [0, 0, EASE.EASE_OUT], [200, -40, EASE.EASE_IN], [400, 0, EASE.EASE_BOTH],
      [600, -25, EASE.EASE_OUT], [800, 0, EASE.EASE_BOTH],
    ]));
  }
  if (boneMap.head) {
    tracks.push(track(boneMap.head, 'rotation', [
      [0, 0, EASE.EASE_OUT], [200, -8, EASE.EASE_BOTH], [duration, 0, EASE.EASE_BOTH],
    ]));
  }
  return motionResult(tracks, duration);
}

// ── Sit ──────────────────────────────────────────────────────────────────
// Principles: Slow-in/Slow-out, Staging (body leans forward slightly,
// reads as settling weight onto a seat).
export function createSitMotion(boneMap, calibration, opts = {}) {
  const duration = opts.duration ?? 800;
  const tracks = [];
  if (boneMap.root) {
    tracks.push(track(boneMap.root, 'y', [[0, 0, EASE.EASE_IN], [duration, 40, EASE.EASE_OUT]]));
  }
  if (boneMap.leftLeg) {
    const bentDown = targetRotation(calibration, 'leftLeg', 'left', 'forward');
    tracks.push(track(boneMap.leftLeg, 'rotation', [[0, 0, EASE.EASE_IN], [duration, bentDown, EASE.EASE_OUT]]));
  }
  if (boneMap.rightLeg) {
    const bentDown = targetRotation(calibration, 'rightLeg', 'right', 'forward');
    tracks.push(track(boneMap.rightLeg, 'rotation', [[0, 0, EASE.EASE_IN], [duration, bentDown, EASE.EASE_OUT]]));
  }
  if (boneMap.body) {
    tracks.push(track(boneMap.body, 'rotation', [[0, 0, EASE.EASE_IN], [duration, -5, EASE.EASE_OUT]]));
  }
  return motionResult(tracks, duration);
}

// ── Look left / right ────────────────────────────────────────────────────
// Principles: Staging (clear held look), Slow-in/Slow-out, Secondary
// Action (eyes could lead the head in a richer rig — left as an easy
// extension point via boneMap.eyes if present).
function lookMotion(boneMap, calibration, opts, sign) {
  const duration = opts.duration ?? 800;
  const tracks = [];
  if (boneMap.head) {
    tracks.push(track(boneMap.head, 'rotation', [
      [0, 0, EASE.EASE_OUT], [duration * 0.4, sign * 30, EASE.EASE_BOTH],
      [duration * 0.8, sign * 30, EASE.EASE_BOTH], [duration, 0, EASE.EASE_IN],
    ]));
  }
  if (boneMap.eyes) {
    // Secondary action: eyes snap to the look direction faster than the head.
    tracks.push(track(boneMap.eyes, 'x', [
      [0, 0, EASE.EASE_OUT], [duration * 0.15, sign * 8, EASE.EASE_BOTH],
      [duration * 0.8, sign * 8, EASE.EASE_BOTH], [duration, 0, EASE.EASE_IN],
    ]));
  }
  return motionResult(tracks, duration);
}
export function createLookLeftMotion(boneMap, calibration, opts = {}) { return lookMotion(boneMap, calibration, opts, -1); }
export function createLookRightMotion(boneMap, calibration, opts = {}) { return lookMotion(boneMap, calibration, opts, 1); }

// ── Nod / Shake head ─────────────────────────────────────────────────────
// Principles: Timing (nod is a touch slower/softer than shake), Exaggeration.
export function createNodMotion(boneMap, calibration, opts = {}) {
  const cycleMs = 350;
  const count = opts.count ?? Math.max(2, Math.round((opts.duration ?? 1000) / cycleMs));
  const tracks = [];
  if (boneMap.head) {
    tracks.push(track(boneMap.head, 'y', repeatCycle(
      [[0, 0], [cycleMs / 2, 10], [cycleMs, 0]], cycleMs, count,
    ), EASE.EASE_BOTH));
  }
  return motionResult(tracks, count * cycleMs);
}

export function createShakeHeadMotion(boneMap, calibration, opts = {}) {
  const cycleMs = 280;
  const count = opts.count ?? Math.max(2, Math.round((opts.duration ?? 1000) / cycleMs));
  const tracks = [];
  if (boneMap.head) {
    tracks.push(track(boneMap.head, 'rotation', repeatCycle(
      [[0, 0], [cycleMs / 2, 22], [cycleMs, -22]], cycleMs, count,
    ), EASE.EASE_BOTH));
  }
  return motionResult(tracks, count * cycleMs);
}

/** Registry mapping LLM action names → motion template functions. */
export const MOTION_LIBRARY = {
  idle: createIdleMotion,
  walk: createWalkMotion,
  run: createRunMotion,
  jump: createJumpMotion,
  wave: createWaveMotion,
  point: createPointMotion,
  clap: createClapMotion,
  dance: createDanceMotion,
  celebrate: createCelebrateMotion,
  sit: createSitMotion,
  look_left: createLookLeftMotion,
  look_right: createLookRightMotion,
  nod: createNodMotion,
  shake_head: createShakeHeadMotion,
};

export const SUPPORTED_ACTIONS = Object.keys(MOTION_LIBRARY);