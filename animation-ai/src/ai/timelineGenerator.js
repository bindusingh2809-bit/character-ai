import { MOTION_LIBRARY, SUPPORTED_ACTIONS } from './motions/motionLibrary';
import { shiftTracks } from './motions/motionUtils';

/**
 * @typedef {{name:string, duration?:number, side?:string, count?:number}} AnimationAction
 * @typedef {{actions: AnimationAction[]}} AnimationPlan
 */

export class UnsupportedActionError extends Error {
  constructor(name) {
    super(`Unsupported animation action: "${name}"`);
    this.name = 'UnsupportedActionError';
    this.action = name;
  }
}

/**
 * Turn an AnimationPlan into a sequenced, merged set of tracks ready to be
 * written into (or previewed against) a Stretchy Studio animation clip.
 *
 * - Each action's motion template runs starting at the running clock,
 *   so actions never overlap.
 * - Tracks for the same (nodeId, property) pair across different actions
 *   are merged into one track, sorted by time.
 *
 * @param {AnimationPlan} plan
 * @param {Record<string,string|null>} boneMap role -> nodeId
 * @returns {{ tracks: Array, duration: number }}
 */
export function generateTimeline(plan, boneMap) {
  if (!plan || !Array.isArray(plan.actions) || plan.actions.length === 0) {
    return { tracks: [], duration: 0 };
  }

  let clock = 0;
  /** @type {Map<string, {nodeId:string, property:string, keyframes:Array}>} */
  const merged = new Map();

  for (const action of plan.actions) {
    const factory = MOTION_LIBRARY[action.name];
    if (!factory) {
      throw new UnsupportedActionError(action.name);
    }

    const durationMs = action.duration != null ? Math.round(action.duration * 1000) : undefined;
    const result = factory(boneMap, {
      duration: durationMs,
      side: action.side,
      count: action.count,
    });

    const offsetTracks = shiftTracks(result.tracks, clock);
    for (const t of offsetTracks) {
      const key = `${t.nodeId}:${t.property}`;
      if (!merged.has(key)) {
        merged.set(key, { nodeId: t.nodeId, property: t.property, keyframes: [] });
      }
      merged.get(key).keyframes.push(...t.keyframes);
    }

    clock += result.duration;
  }

  const tracks = Array.from(merged.values()).map(t => ({
    ...t,
    keyframes: [...t.keyframes].sort((a, b) => a.time - b.time),
  }));

  return { tracks, duration: clock };
}

/** Validate that every action in a plan is one we know how to animate. */
export function validatePlanActions(plan) {
  const unknown = (plan.actions ?? [])
    .map(a => a.name)
    .filter(name => !SUPPORTED_ACTIONS.includes(name));
  return { valid: unknown.length === 0, unknown };
}
