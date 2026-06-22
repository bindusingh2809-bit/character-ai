/**
 * Shared utilities for building animation tracks (matches the engine's
 * track shape: { nodeId, property, keyframes: [{ time, value, easing }] }).
 * All values produced here are DELTAS layered on top of the rig's rest
 * pose — motion templates never need to know a node's current transform.
 */

export const EASE = {
  LINEAR: 'linear',
  EASE_IN_OUT: 'easeInOut',
};

/** Build a single track for one nodeId/property pair. */
export function track(nodeId, property, keyframes, easing = EASE.EASE_IN_OUT) {
  return {
    nodeId,
    property,
    keyframes: keyframes.map(([time, value]) => ({ time, value, easing })),
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
    for (const [t, v] of cycleKeyframes) {
      // Avoid duplicate identical times at cycle boundaries.
      const time = offset + t;
      if (out.length && out[out.length - 1][0] === time) {
        out[out.length - 1] = [time, v];
      } else {
        out.push([time, v]);
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
