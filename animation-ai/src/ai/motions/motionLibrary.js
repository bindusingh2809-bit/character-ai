import { track, repeatCycle, motionResult, EASE } from './motionUtils';

/**
 * Each createXMotion(boneMap, opts) returns { tracks, duration }.
 * `opts.duration` (ms) scales the motion; `opts.side` picks left/right;
 * `opts.count` repeats cyclic motions (jump, wave, nod, clap...).
 *
 * Values are DELTAS added on top of the rig's rest pose by the timeline
 * generator/engine, so these templates work on any rig regardless of its
 * base transform values.
 */

const DEFAULT_DURATION = 1000;

function sideRole(base, side) {
  return side === 'left' ? `left${base}` : `right${base}`;
}

// ── Idle / breathing ─────────────────────────────────────────────────────
export function createIdleMotion(boneMap, opts = {}) {
  const duration = opts.duration ?? 1600;
  const tracks = [];
  if (boneMap.body) {
    tracks.push(track(boneMap.body, 'y', [
      [0, 0], [duration / 2, -3], [duration, 0],
    ]));
  }
  return motionResult(tracks, duration);
}

// ── Walk / Run ───────────────────────────────────────────────────────────
function gaitMotion(boneMap, opts, { stepDeg, bobAmount, cycleMs }) {
  const duration = opts.duration ?? DEFAULT_DURATION * 2;
  const cycles = Math.max(1, Math.round(duration / cycleMs));
  const tracks = [];

  if (boneMap.leftLeg) {
    tracks.push(track(boneMap.leftLeg, 'rotation', repeatCycle(
      [[0, -stepDeg], [cycleMs / 2, stepDeg], [cycleMs, -stepDeg]], cycleMs, cycles,
    )));
  }
  if (boneMap.rightLeg) {
    tracks.push(track(boneMap.rightLeg, 'rotation', repeatCycle(
      [[0, stepDeg], [cycleMs / 2, -stepDeg], [cycleMs, stepDeg]], cycleMs, cycles,
    )));
  }
  if (boneMap.leftArm) {
    tracks.push(track(boneMap.leftArm, 'rotation', repeatCycle(
      [[0, stepDeg * 0.6], [cycleMs / 2, -stepDeg * 0.6], [cycleMs, stepDeg * 0.6]], cycleMs, cycles,
    )));
  }
  if (boneMap.rightArm) {
    tracks.push(track(boneMap.rightArm, 'rotation', repeatCycle(
      [[0, -stepDeg * 0.6], [cycleMs / 2, stepDeg * 0.6], [cycleMs, -stepDeg * 0.6]], cycleMs, cycles,
    )));
  }
  if (boneMap.body) {
    tracks.push(track(boneMap.body, 'y', repeatCycle(
      [[0, 0], [cycleMs / 4, -bobAmount], [cycleMs / 2, 0], [(3 * cycleMs) / 4, -bobAmount], [cycleMs, 0]],
      cycleMs, cycles,
    )));
  }
  return motionResult(tracks, cycles * cycleMs);
}

export function createWalkMotion(boneMap, opts = {}) {
  return gaitMotion(boneMap, opts, { stepDeg: 18, bobAmount: 4, cycleMs: 600 });
}

export function createRunMotion(boneMap, opts = {}) {
  return gaitMotion(boneMap, opts, { stepDeg: 32, bobAmount: 8, cycleMs: 360 });
}

// ── Jump ─────────────────────────────────────────────────────────────────
export function createJumpMotion(boneMap, opts = {}) {
  const count = opts.count ?? 1;
  const jumpMs = opts.duration ? Math.round(opts.duration / count) : 600;
  const tracks = [];
  const liftHeight = 60;

  if (boneMap.root || boneMap.body) {
    const target = boneMap.root ?? boneMap.body;
    tracks.push(track(target, 'y', repeatCycle(
      [[0, 0], [jumpMs * 0.3, -liftHeight], [jumpMs * 0.6, -liftHeight], [jumpMs, 0]],
      jumpMs, count,
    ), EASE.EASE_IN_OUT));
  }
  if (boneMap.leftLeg) {
    tracks.push(track(boneMap.leftLeg, 'rotation', repeatCycle(
      [[0, 0], [jumpMs * 0.3, -20], [jumpMs * 0.6, 10], [jumpMs, 0]], jumpMs, count,
    )));
  }
  if (boneMap.rightLeg) {
    tracks.push(track(boneMap.rightLeg, 'rotation', repeatCycle(
      [[0, 0], [jumpMs * 0.3, 20], [jumpMs * 0.6, -10], [jumpMs, 0]], jumpMs, count,
    )));
  }
  if (boneMap.leftArm) {
    tracks.push(track(boneMap.leftArm, 'rotation', repeatCycle(
      [[0, 0], [jumpMs * 0.3, -30], [jumpMs, 0]], jumpMs, count,
    )));
  }
  if (boneMap.rightArm) {
    tracks.push(track(boneMap.rightArm, 'rotation', repeatCycle(
      [[0, 0], [jumpMs * 0.3, 30], [jumpMs, 0]], jumpMs, count,
    )));
  }
  return motionResult(tracks, jumpMs * count);
}

// ── Wave ─────────────────────────────────────────────────────────────────
export function createWaveMotion(boneMap, opts = {}) {
  const side = opts.side ?? 'right';
  const arm = boneMap[sideRole('Arm', side)];
  const cycleMs = 350;
  const count = opts.count ?? Math.max(2, Math.round((opts.duration ?? 1400) / cycleMs));
  const tracks = [];
  if (arm) {
    // In 2D canvas: positive rotation = clockwise (arm goes DOWN/inward).
    // To raise arm upward, right arm needs negative (CCW), left arm positive (CW).
    const raiseAngle = side === 'right' ? -90 : 90;
    // Wave oscillates ±20° around the raised position
    const waveA = raiseAngle - 20;
    const waveB = raiseAngle + 20;
    tracks.push(track(arm, 'rotation', [
      [0, 0],
      [120, raiseAngle],
      ...repeatCycle([[0, raiseAngle], [cycleMs / 2, waveA], [cycleMs, waveB]], cycleMs, count).map(
        ([t, v]) => [t + 120, v],
      ),
      [120 + count * cycleMs + 150, 0],
    ]));
  }
  return motionResult(tracks, 120 + count * cycleMs + 150);
}

// ── Point ────────────────────────────────────────────────────────────────
export function createPointMotion(boneMap, opts = {}) {
  const side = opts.side ?? 'right';
  const arm = boneMap[sideRole('Arm', side)];
  const duration = opts.duration ?? 1200;
  const tracks = [];
  if (arm) {
    const sign = side === 'left' ? -1 : 1;
    tracks.push(track(arm, 'rotation', [
      [0, 0], [250, sign * -80], [duration - 250, sign * -80], [duration, 0],
    ]));
  }
  return motionResult(tracks, duration);
}

// ── Clap ─────────────────────────────────────────────────────────────────
export function createClapMotion(boneMap, opts = {}) {
  const cycleMs = 280;
  const count = opts.count ?? Math.max(2, Math.round((opts.duration ?? 1200) / cycleMs));
  const tracks = [];
  if (boneMap.leftArm) {
    tracks.push(track(boneMap.leftArm, 'rotation', repeatCycle(
      [[0, -40], [cycleMs / 2, -70], [cycleMs, -40]], cycleMs, count,
    )));
  }
  if (boneMap.rightArm) {
    tracks.push(track(boneMap.rightArm, 'rotation', repeatCycle(
      [[0, 40], [cycleMs / 2, 70], [cycleMs, 40]], cycleMs, count,
    )));
  }
  return motionResult(tracks, count * cycleMs);
}

// ── Dance ────────────────────────────────────────────────────────────────
export function createDanceMotion(boneMap, opts = {}) {
  const cycleMs = 400;
  const duration = opts.duration ?? 2400;
  const count = Math.max(1, Math.round(duration / cycleMs));
  const tracks = [];
  if (boneMap.body) {
    tracks.push(track(boneMap.body, 'rotation', repeatCycle(
      [[0, -8], [cycleMs / 2, 8], [cycleMs, -8]], cycleMs, count,
    )));
  }
  if (boneMap.leftArm) {
    tracks.push(track(boneMap.leftArm, 'rotation', repeatCycle(
      [[0, -50], [cycleMs / 2, -20], [cycleMs, -50]], cycleMs, count,
    )));
  }
  if (boneMap.rightArm) {
    tracks.push(track(boneMap.rightArm, 'rotation', repeatCycle(
      [[0, 50], [cycleMs / 2, 20], [cycleMs, 50]], cycleMs, count,
    )));
  }
  if (boneMap.root) {
    tracks.push(track(boneMap.root, 'y', repeatCycle(
      [[0, 0], [cycleMs / 2, -10], [cycleMs, 0]], cycleMs, count,
    )));
  }
  return motionResult(tracks, count * cycleMs);
}

// ── Celebrate ────────────────────────────────────────────────────────────
export function createCelebrateMotion(boneMap, opts = {}) {
  const duration = opts.duration ?? 1400;
  const tracks = [];
  if (boneMap.leftArm) {
    tracks.push(track(boneMap.leftArm, 'rotation', [
      [0, 0], [200, -160], [duration - 200, -160], [duration, 0],
    ]));
  }
  if (boneMap.rightArm) {
    tracks.push(track(boneMap.rightArm, 'rotation', [
      [0, 0], [200, 160], [duration - 200, 160], [duration, 0],
    ]));
  }
  if (boneMap.root) {
    tracks.push(track(boneMap.root, 'y', [
      [0, 0], [200, -40], [400, 0], [600, -25], [800, 0],
    ]));
  }
  return motionResult(tracks, duration);
}

// ── Sit ──────────────────────────────────────────────────────────────────
export function createSitMotion(boneMap, opts = {}) {
  const duration = opts.duration ?? 800;
  const tracks = [];
  if (boneMap.root) {
    tracks.push(track(boneMap.root, 'y', [[0, 0], [duration, 40]]));
  }
  if (boneMap.leftLeg) {
    tracks.push(track(boneMap.leftLeg, 'rotation', [[0, 0], [duration, -85]]));
  }
  if (boneMap.rightLeg) {
    tracks.push(track(boneMap.rightLeg, 'rotation', [[0, 0], [duration, 85]]));
  }
  if (boneMap.body) {
    tracks.push(track(boneMap.body, 'rotation', [[0, 0], [duration, -5]]));
  }
  return motionResult(tracks, duration);
}

// ── Look left / right ────────────────────────────────────────────────────
function lookMotion(boneMap, opts, sign) {
  const duration = opts.duration ?? 800;
  const tracks = [];
  if (boneMap.head) {
    tracks.push(track(boneMap.head, 'rotation', [
      [0, 0], [duration * 0.4, sign * 30], [duration * 0.8, sign * 30], [duration, 0],
    ]));
  }
  return motionResult(tracks, duration);
}
export function createLookLeftMotion(boneMap, opts = {}) { return lookMotion(boneMap, opts, -1); }
export function createLookRightMotion(boneMap, opts = {}) { return lookMotion(boneMap, opts, 1); }

// ── Nod / Shake head ─────────────────────────────────────────────────────
export function createNodMotion(boneMap, opts = {}) {
  const cycleMs = 350;
  const count = opts.count ?? Math.max(2, Math.round((opts.duration ?? 1000) / cycleMs));
  const tracks = [];
  if (boneMap.head) {
    tracks.push(track(boneMap.head, 'y', repeatCycle(
      [[0, 0], [cycleMs / 2, 10], [cycleMs, 0]], cycleMs, count,
    )));
  }
  return motionResult(tracks, count * cycleMs);
}

export function createShakeHeadMotion(boneMap, opts = {}) {
  const cycleMs = 300;
  const count = opts.count ?? Math.max(2, Math.round((opts.duration ?? 1000) / cycleMs));
  const tracks = [];
  if (boneMap.head) {
    tracks.push(track(boneMap.head, 'rotation', repeatCycle(
      [[0, 0], [cycleMs / 2, 20], [cycleMs, -20]], cycleMs, count,
    )));
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