/**
 * Shared utilities for building animation tracks (matches the engine's
 * track shape: { nodeId, property, keyframes: [{ time, value, easing }] }).
 *
 * IMPORTANT FIX: the engine (renderer/animationEngine.js → evaluateEasing)
 * only recognizes the literal strings 'linear', 'ease' / 'ease-both',
 * 'ease-in', 'ease-out', 'stepped', or a 4-number cubic-bezier array. The
 * previous version of this file exported EASE.EASE_IN_OUT = 'easeInOut',
 * which matches NONE of those — every keyframe in the entire old motion
 * library was silently falling through to linear interpolation, with no
 * error anywhere. Every motion below now uses an easing value the engine
 * actually understands, so principle #4 (slow in / slow out) really works.
 */

export const EASE = {
  LINEAR:      'linear',
  EASE_BOTH:   'ease-both',  // smooth in & out — the default for most motion
  EASE_IN:     'ease-in',    // starts slow, accelerates (good for anticipation→action)
  EASE_OUT:    'ease-out',   // decelerates into the hold (good for settles)
  STEPPED:     'stepped',
  // Custom bezier curves as [cx1, cy1, cx2, cy2]. cy values can exceed 1 or
  // go below 0 to create OVERSHOOT (principle #9, follow-through) — the
  // value briefly passes the target before settling back, like a tennis
  // swing's follow-through or a wave's little extra flourish at the top.
  OVERSHOOT:   [0.34, 1.56, 0.64, 1],
  ANTICIPATE:  [0.36, 0, 0.66, -0.56], // dips backward before committing forward
  EASE_IN_OUT: 'ease-both', // kept as an alias so any external callers using
                            // the old name still get a *working* curve.
};

/** Build a single track for one nodeId/property pair. */
export function track(nodeId, property, keyframes, easing = EASE.EASE_BOTH) {
  return {
    nodeId,
    property,
    keyframes: keyframes.map(([time, value, kfEasing]) => ({
      time,
      value,
      easing: kfEasing ?? easing,
    })),
  };
}

/**
 * Repeat a list of [time, value] keyframe pairs `count` times back-to-back,
 * each cycle lasting `cycleMs`, offsetting time accordingly.
 */
export function repeatCycle(cycleKeyframes, cycleMs, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const offset = i * cycleMs;
    for (const kf of cycleKeyframes) {
      const [t, v, easing] = kf;
      const time = offset + t;
      if (out.length && out[out.length - 1][0] === time) {
        out[out.length - 1] = [time, v, easing];
      } else {
        out.push([time, v, easing]);
      }
    }
  }
  return out;
}

/** Shift every keyframe's time by `offsetMs`. */
export function shiftTracks(tracks, offsetMs) {
  return tracks.map(t => ({
    ...t,
    keyframes: t.keyframes.map(kf => ({ ...kf, time: kf.time + offsetMs })),
  }));
}

/**
 * A motion result: { tracks, duration }.
 * duration is in milliseconds and drives how the timeline generator
 * sequences the next action.
 */
export function motionResult(tracks, duration) {
  return { tracks, duration };
}

/**
 * Build a track with an explicit ANTICIPATION → ACTION → OVERSHOOT →
 * SETTLE shape (principles #1 Squash/Stretch-adjacent timing, #5
 * Anticipation, #9 Secondary Action/Follow-through, #4 Slow-in/Slow-out),
 * instead of a flat A→B move.
 *
 *   restValue ──(small move opposite of action)──> anticipationValue
 *             ──(fast, eased-in move)──────────────> overshootValue (past target)
 *             ──(settle back)─────────────────────> targetValue
 *             ...hold...
 *             ──(return, mirrored anticipation+overshoot)──> restValue
 *
 * @param {number} restValue        starting/ending value (usually 0, the rest pose delta)
 * @param {number} targetValue      the actual pose we want to hold
 * @param {object} opts
 * @param {number} opts.anticipation  how far to dip the *wrong* way first (in target units, default 8% of travel)
 * @param {number} opts.overshoot     how far past the target to fling before settling (default 12% of travel)
 * @param {number} opts.anticipateMs  duration of the anticipation dip (default 90ms)
 * @param {number} opts.actionMs      duration of the main move into overshoot (default 140ms)
 * @param {number} opts.settleMs      duration of overshoot→target settle (default 100ms)
 * @param {number} opts.holdMs        how long to hold at target before any return phase (default 0)
 * @param {boolean} opts.returnToRest  if true, mirrors the motion back down to restValue at the end
 * @param {number} opts.returnMs      duration of the return phase (default = actionMs + settleMs)
 * @returns {Array<[number, number, string|Array]>} keyframe tuples starting at t=0
 */
export function anticipateActionSettle(restValue, targetValue, opts = {}) {
  const travel = targetValue - restValue;
  const anticipation = opts.anticipation ?? Math.sign(travel || 1) * Math.abs(travel) * -0.08;
  const overshoot = opts.overshoot ?? travel * 0.12;
  const anticipateMs = opts.anticipateMs ?? 90;
  const actionMs = opts.actionMs ?? 140;
  const settleMs = opts.settleMs ?? 100;
  const holdMs = opts.holdMs ?? 0;

  let t = 0;
  const kfs = [[t, restValue, EASE.EASE_OUT]];

  t += anticipateMs;
  kfs.push([t, restValue + anticipation, EASE.EASE_IN]);

  t += actionMs;
  kfs.push([t, targetValue + overshoot, EASE.EASE_OUT]);

  t += settleMs;
  kfs.push([t, targetValue, EASE.EASE_BOTH]);

  if (holdMs > 0) {
    t += holdMs;
    kfs.push([t, targetValue, EASE.EASE_BOTH]);
  }

  if (opts.returnToRest) {
    const returnMs = opts.returnMs ?? (actionMs + settleMs);
    const returnOvershoot = -overshoot * 0.5; // gentler overshoot on the way back down
    t += Math.round(returnMs * 0.6);
    kfs.push([t, restValue + returnOvershoot, EASE.EASE_OUT]);
    t += Math.round(returnMs * 0.4);
    kfs.push([t, restValue, EASE.EASE_BOTH]);
  }

  return kfs;
}

/**
 * Build a companion track for a secondary/follow-through joint (e.g. an
 * elbow or hand bone that should lag slightly behind its parent's motion —
 * principle #9, Secondary Action / Follow-through / Drag).
 *
 * Takes the SAME keyframe shape as the parent track but delays each
 * keyframe's time by `lagMs` and scales the value by `scale` (typically
 * 0.3–0.6 so the child rotates less dramatically than the parent, the way
 * a forearm trails a shoulder swing).
 *
 * @param {Array<[number,number,string|Array]>} parentKeyframes
 * @param {number} lagMs
 * @param {number} scale
 */
export function followThrough(parentKeyframes, lagMs = 60, scale = 0.4) {
  return parentKeyframes.map(([t, v, easing]) => [t + lagMs, v * scale, easing]);
}

/**
 * Distribute a value along an ARC instead of a straight interpolation
 * (principle #6, Arcs). Most natural limb motion follows an arc rather
 * than a straight line; this is most useful for paired x/y tracks (e.g.
 * a hand's incidental drift) layered alongside the primary rotation track.
 * Returns keyframes for a perpendicular "bulge" track that, when added to
 * a linear A→B move on one axis, bends the path into an arc.
 *
 * @param {number} startMs
 * @param {number} endMs
 * @param {number} peakOffset   how far the arc bulges at its midpoint (px)
 */
export function arcBulgeKeyframes(startMs, endMs, peakOffset) {
  const mid = (startMs + endMs) / 2;
  return [
    [startMs, 0, EASE.EASE_OUT],
    [mid, peakOffset, EASE.EASE_BOTH],
    [endMs, 0, EASE.EASE_IN],
  ];
}