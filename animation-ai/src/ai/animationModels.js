import { SUPPORTED_ACTIONS } from './motions/motionLibrary';

export class InvalidAnimationPlanError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidAnimationPlanError';
  }
}

/**
 * Validate and normalize a raw parsed-JSON object into an AnimationPlan.
 * Throws InvalidAnimationPlanError on any structural problem. This mirrors
 * the Pydantic validation done server-side so a malformed/hallucinated LLM
 * response can never reach the timeline generator.
 */
export function parseAnimationPlan(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new InvalidAnimationPlanError('Response is not a JSON object.');
  }
  if (!Array.isArray(raw.actions) || raw.actions.length === 0) {
    throw new InvalidAnimationPlanError('Response is missing a non-empty "actions" array.');
  }

  const actions = raw.actions.map((a, i) => {
    if (!a || typeof a !== 'object' || typeof a.name !== 'string') {
      throw new InvalidAnimationPlanError(`Action at index ${i} is missing a "name" string.`);
    }
    if (!SUPPORTED_ACTIONS.includes(a.name)) {
      throw new InvalidAnimationPlanError(
        `Action "${a.name}" at index ${i} is not a supported action (${SUPPORTED_ACTIONS.join(', ')}).`,
      );
    }
    const action = { name: a.name };
    if (a.duration != null) {
      const d = Number(a.duration);
      if (!Number.isFinite(d) || d <= 0) {
        throw new InvalidAnimationPlanError(`Action "${a.name}" has an invalid duration.`);
      }
      action.duration = d;
    }
    if (a.side != null) {
      if (a.side !== 'left' && a.side !== 'right') {
        throw new InvalidAnimationPlanError(`Action "${a.name}" has an invalid side "${a.side}".`);
      }
      action.side = a.side;
    }
    if (a.count != null) {
      const c = Number(a.count);
      if (!Number.isInteger(c) || c <= 0) {
        throw new InvalidAnimationPlanError(`Action "${a.name}" has an invalid count.`);
      }
      action.count = c;
    }
    return action;
  });

  return { actions };
}
