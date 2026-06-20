// Computes world-space start/end points + world rotation for every bone,
// walking up the parent chain. Root bones (parent_id === null) use their
// own x/y as the world start point. Child bones start at their parent's
// world tip.

export function buildWorldTransforms(bones) {
  const byId = Object.fromEntries(bones.map((b) => [b.id, b]));
  const cache = {};

  function resolve(id) {
    if (cache[id]) return cache[id];
    const bone = byId[id];
    if (!bone) return null;

    let startX, startY, worldRotation;

    if (!bone.parent_id || !byId[bone.parent_id]) {
      startX = bone.x;
      startY = bone.y;
      worldRotation = bone.rotation;
    } else {
      const parent = resolve(bone.parent_id);
      startX = parent.endX;
      startY = parent.endY;
      worldRotation = parent.worldRotation + bone.rotation;
    }

    const endX = startX + Math.cos(worldRotation) * bone.length;
    const endY = startY + Math.sin(worldRotation) * bone.length;

    const result = { id, startX, startY, endX, endY, worldRotation };
    cache[id] = result;
    return result;
  }

  bones.forEach((b) => resolve(b.id));
  return cache;
}

// Given a desired world rotation for a bone, return the local rotation
// value to store (relative to parent's world rotation).
export function worldToLocalRotation(bone, byId, desiredWorldRotation) {
  if (!bone.parent_id || !byId[bone.parent_id]) {
    return desiredWorldRotation;
  }
  const transforms = buildWorldTransforms(Object.values(byId));
  const parentWorld = transforms[bone.parent_id].worldRotation;
  return desiredWorldRotation - parentWorld;
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}
