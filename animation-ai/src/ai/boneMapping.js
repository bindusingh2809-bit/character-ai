/**
 * Bone Mapping System
 * ────────────────────
 * Stretchy Studio rigs are flat node graphs (groups/parts) with user-given
 * names — there is no fixed "arm_l" / "arm_r" bone schema like a 3D skeleton.
 * Motion templates must never hardcode a node id or a specific rig's naming
 * convention. Instead they address semantic roles ("rightArm", "head", ...)
 * and this module resolves those roles to actual node ids for the loaded
 * project, either by auto-detecting common naming patterns or by an explicit
 * user-provided override map (persisted per-project).
 */

/** Canonical semantic roles motion templates may use. */
export const SEMANTIC_ROLES = [
  'root',
  'body',
  'head',
  'leftArm',
  'rightArm',
  'leftElbow',
  'rightElbow',
  'leftHand',
  'rightHand',
  'leftLeg',
  'rightLeg',
  'leftKnee',
  'rightKnee',
  'leftFoot',
  'rightFoot',
];

// Ordered (most-specific-first) regex patterns used for auto-detection.
// These are only a FALLBACK for rigs without an authoritative `boneRole`
// tag (e.g. hand-built/imported rigs) — see autoDetectBoneMap below.
const ROLE_PATTERNS = {
  rightArm:  [/\bright[\s_-]?arm\b/i, /\barm[\s_-]?r(ight)?\b/i, /\barm_r\b/i],
  leftArm:   [/\bleft[\s_-]?arm\b/i,  /\barm[\s_-]?l(eft)?\b/i,  /\barm_l\b/i],
  rightElbow:[/\bright[\s_-]?elbow\b/i, /\belbow[\s_-]?r(ight)?\b/i, /\belbow_r\b/i],
  leftElbow: [/\bleft[\s_-]?elbow\b/i,  /\belbow[\s_-]?l(eft)?\b/i,  /\belbow_l\b/i],
  rightHand: [/\bright[\s_-]?hand\b/i, /\bhand[\s_-]?r(ight)?\b/i],
  leftHand:  [/\bleft[\s_-]?hand\b/i,  /\bhand[\s_-]?l(eft)?\b/i],
  rightLeg:  [/\bright[\s_-]?leg\b/i, /\bleg[\s_-]?r(ight)?\b/i, /\bleg_r\b/i, /\bthigh[\s_-]?r/i],
  leftLeg:   [/\bleft[\s_-]?leg\b/i,  /\bleg[\s_-]?l(eft)?\b/i,  /\bleg_l\b/i, /\bthigh[\s_-]?l/i],
  rightKnee: [/\bright[\s_-]?knee\b/i, /\bknee[\s_-]?r(ight)?\b/i, /\bknee_r\b/i],
  leftKnee:  [/\bleft[\s_-]?knee\b/i,  /\bknee[\s_-]?l(eft)?\b/i,  /\bknee_l\b/i],
  rightFoot: [/\bright[\s_-]?foot\b/i, /\bfoot[\s_-]?r(ight)?\b/i],
  leftFoot:  [/\bleft[\s_-]?foot\b/i,  /\bfoot[\s_-]?l(eft)?\b/i],
  head:      [/\bhead\b/i, /\bskull\b/i],
  body:      [/\bbody\b/i, /\btorso\b/i, /\bspine\b/i, /\bchest\b/i],
  root:      [/\broot\b/i, /\bhips?\b/i, /\bpelvis\b/i],
};

/**
 * Auto-detect a role → nodeId map from the project's node list.
 *
 * Rigs built by the auto-armature tool (armatureOrganizer.js) already tag
 * every bone group with an authoritative `node.boneRole` (e.g. 'leftElbow',
 * 'rightKnee') — that's ground truth and must win. Regex name-matching is
 * only a fallback for nodes that don't carry that tag (hand-drawn/imported
 * rigs where the user named layers "Right Arm", "arm_r", etc. themselves).
 * Previously this function ignored `boneRole` entirely and relied solely on
 * name regexes that didn't even know about elbow/knee roles — so rigs built
 * by the auto-armature tool, where joints are correctly tagged but may be
 * named generically (or via "handwear-l"/"footwear-r" leaf layers that don't
 * match the hand/foot patterns), looked completely unmapped.
 *
 * @param {Array<{id:string,name:string,parent:?string,type:string,boneRole?:string}>} nodes
 * @returns {Record<string,string|null>}
 */
export function autoDetectBoneMap(nodes = []) {
  const map = Object.fromEntries(SEMANTIC_ROLES.map(r => [r, null]));

  // Pass 1: trust the authoritative boneRole tag wherever present.
  for (const role of SEMANTIC_ROLES) {
    const match = nodes.find(n => n.boneRole === role);
    if (match) map[role] = match.id;
  }

  // Pass 2: for any role still unmapped, fall back to name-pattern guessing.
  for (const role of SEMANTIC_ROLES) {
    if (map[role]) continue;
    const patterns = ROLE_PATTERNS[role];
    if (!patterns) continue;
    const match = nodes.find(n => patterns.some(p => p.test(n.name ?? '')));
    if (match) map[role] = match.id;
  }

  // Fallback: if no root found, use the first node with no parent.
  if (!map.root) {
    const top = nodes.find(n => !n.parent);
    if (top) map.root = top.id;
  }
  return map;
}

/**
 * Merge a user override map on top of auto-detected roles.
 * Override values of '' or null clear that role.
 */
export function resolveBoneMap(nodes, overrides = {}) {
  const auto = autoDetectBoneMap(nodes);
  const resolved = { ...auto };
  for (const role of SEMANTIC_ROLES) {
    if (role in overrides) {
      resolved[role] = overrides[role] || null;
    }
  }
  return resolved;
}

/** Returns true if enough roles are mapped to attempt the given motion's bones. */
export function hasRoles(boneMap, roles = []) {
  return roles.every(r => Boolean(boneMap[r]));
}