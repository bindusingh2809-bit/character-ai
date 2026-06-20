// A deliberately small humanoid rig: enough bones to read as walking, waving,
// running, jumping and dancing, without requiring per-pixel limb segmentation
// (which a flat illustration can't give us). Each bone's *position* follows
// its parent via forward kinematics; each bone's *rotation* is keyframed
// independently per preset (see animations.js).
export const BONE_DEFS = [
  { name: 'spine', parent: null, from: 'midHip', to: 'midShoulder' },
  { name: 'head', parent: 'spine', from: 'midShoulder', to: 'headTop' },
  { name: 'leftUpperArm', parent: 'spine', from: 'left_shoulder', to: 'left_elbow' },
  { name: 'leftLowerArm', parent: 'leftUpperArm', from: 'left_elbow', to: 'left_wrist' },
  { name: 'rightUpperArm', parent: 'spine', from: 'right_shoulder', to: 'right_elbow' },
  { name: 'rightLowerArm', parent: 'rightUpperArm', from: 'right_elbow', to: 'right_wrist' },
  { name: 'leftUpperLeg', parent: null, from: 'left_hip', to: 'left_knee' },
  { name: 'leftLowerLeg', parent: 'leftUpperLeg', from: 'left_knee', to: 'left_ankle' },
  { name: 'rightUpperLeg', parent: null, from: 'right_hip', to: 'right_knee' },
  { name: 'rightLowerLeg', parent: 'rightUpperLeg', from: 'right_knee', to: 'right_ankle' },
]

// MoveNet (COCO-17) keypoint name -> index
export const KEYPOINT_INDEX = {
  nose: 0,
  left_eye: 1,
  right_eye: 2,
  left_ear: 3,
  right_ear: 4,
  left_shoulder: 5,
  right_shoulder: 6,
  left_elbow: 7,
  right_elbow: 8,
  left_wrist: 9,
  right_wrist: 10,
  left_hip: 11,
  right_hip: 12,
  left_knee: 13,
  right_knee: 14,
  left_ankle: 15,
  right_ankle: 16,
}

const MIN_KEYPOINT_SCORE = 0.3

function mid(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/**
 * Builds a lookup of named joint positions (image-pixel space) from raw
 * MoveNet keypoints, deriving the synthetic joints (midHip, midShoulder,
 * headTop) the rig needs but MoveNet doesn't directly output.
 */
function jointsFromKeypoints(keypoints) {
  const byName = {}
  for (const [name, idx] of Object.entries(KEYPOINT_INDEX)) {
    byName[name] = keypoints[idx]
  }
  const usable = (kp) => kp && kp.score >= MIN_KEYPOINT_SCORE

  if (!usable(byName.left_hip) || !usable(byName.right_hip) ||
      !usable(byName.left_shoulder) || !usable(byName.right_shoulder)) {
    return null // not enough signal to build a rig from this image
  }

  const midHip = mid(byName.left_hip, byName.right_hip)
  const midShoulder = mid(byName.left_shoulder, byName.right_shoulder)
  const torsoLen = Math.hypot(midShoulder.x - midHip.x, midShoulder.y - midHip.y) || 1
  const headTop = usable(byName.nose)
    ? { x: midShoulder.x + (midShoulder.x - midHip.x) * 0.15, y: byName.nose.y - torsoLen * 0.35 }
    : { x: midShoulder.x, y: midShoulder.y - torsoLen * 0.6 }

  return { ...byName, midHip, midShoulder, headTop }
}

/**
 * Builds a fully proportional fallback skeleton from just the image's
 * bounding box, using average humanoid proportions. Used when pose
 * detection can't find a confident person in the artwork (common with
 * stylized characters, mascots, or non-frontal poses) so the app still
 * produces something animatable instead of a dead end.
 */
function jointsFromProportions(width, height) {
  const cx = width / 2
  const top = height * 0.06
  const bottom = height * 0.96
  const bodyH = bottom - top
  const headTop = { x: cx, y: top }
  const midShoulder = { x: cx, y: top + bodyH * 0.18 }
  const midHip = { x: cx, y: top + bodyH * 0.5 }
  const shoulderW = width * 0.22
  const hipW = width * 0.14
  return {
    headTop,
    midShoulder,
    midHip,
    left_shoulder: { x: cx - shoulderW, y: midShoulder.y },
    right_shoulder: { x: cx + shoulderW, y: midShoulder.y },
    left_elbow: { x: cx - shoulderW * 1.15, y: midShoulder.y + bodyH * 0.18 },
    right_elbow: { x: cx + shoulderW * 1.15, y: midShoulder.y + bodyH * 0.18 },
    left_wrist: { x: cx - shoulderW * 1.05, y: midShoulder.y + bodyH * 0.34 },
    right_wrist: { x: cx + shoulderW * 1.05, y: midShoulder.y + bodyH * 0.34 },
    left_hip: { x: cx - hipW, y: midHip.y },
    right_hip: { x: cx + hipW, y: midHip.y },
    left_knee: { x: cx - hipW * 1.1, y: top + bodyH * 0.74 },
    right_knee: { x: cx + hipW * 1.1, y: top + bodyH * 0.74 },
    left_ankle: { x: cx - hipW, y: bottom },
    right_ankle: { x: cx + hipW, y: bottom },
  }
}

/**
 * Adapter for the Python backend's keypoint format: a plain object of
 * { name: [x, y] } (already named left_shoulder/right_elbow/etc — same
 * vocabulary as KEYPOINT_INDEX above), with no MoveNet-style confidence
 * scores since MediaPipe Pose either returns a full set or none at all.
 * Returns the same shape jointsFromKeypoints() returns, so buildSkeleton
 * can treat both pose sources identically.
 */
function jointsFromBackendKeypoints(kpDict) {
  if (!kpDict) return null
  const required = ['left_hip', 'right_hip', 'left_shoulder', 'right_shoulder']
  if (!required.every((k) => Array.isArray(kpDict[k]))) return null

  const byName = {}
  for (const [name, [x, y]] of Object.entries(kpDict)) {
    byName[name] = { x, y }
  }

  const midHip = mid(byName.left_hip, byName.right_hip)
  const midShoulder = mid(byName.left_shoulder, byName.right_shoulder)
  const torsoLen = Math.hypot(midShoulder.x - midHip.x, midShoulder.y - midHip.y) || 1
  const headTop = byName.nose
    ? { x: midShoulder.x + (midShoulder.x - midHip.x) * 0.15, y: byName.nose.y - torsoLen * 0.35 }
    : { x: midShoulder.x, y: midShoulder.y - torsoLen * 0.6 }

  return { ...byName, midHip, midShoulder, headTop }
}

function angleOf(p0, p1) {
  return Math.atan2(p1.y - p0.y, p1.x - p0.x)
}

/**
 * Turns a joints map into the actual bone rest-state used for FK + skinning:
 * absolute start point, absolute rest angle, and bone length.
 */
export function buildBones(joints) {
  const bones = {}
  for (const def of BONE_DEFS) {
    const from = joints[def.from]
    const to = joints[def.to]
    bones[def.name] = {
      name: def.name,
      parent: def.parent,
      restStart: { x: from.x, y: from.y },
      restEnd: { x: to.x, y: to.y },
      restAngle: angleOf(from, to),
      length: Math.hypot(to.x - from.x, to.y - from.y) || 1,
    }
  }
  return bones
}

/**
 * Public entry point: given MoveNet keypoints (or null) and the image's
 * pixel size, returns { bones, source } where source is "detected" or
 * "estimated" so the UI can be honest about which path was used.
 */
export function buildSkeleton(keypoints, width, height) {
  const detected = keypoints ? jointsFromKeypoints(keypoints) : null
  if (detected) {
    return { bones: buildBones(detected), joints: detected, source: 'detected' }
  }
  const estimated = jointsFromProportions(width, height)
  return { bones: buildBones(estimated), joints: estimated, source: 'estimated' }
}

/**
 * Same contract as buildSkeleton(), but for keypoints coming from the
 * Python backend (MediaPipe Pose), which are already a named
 * {name: [x,y]} object rather than a MoveNet COCO-17 array.
 * `usedFallbackPose` comes straight from the backend's /segment response —
 * it ran its own proportional fallback server-side if pose detection
 * failed, so we trust that flag for the "detected" vs "estimated" badge.
 */
export function buildSkeletonFromBackend(kpDict, usedFallbackPose, width, height) {
  const joints = jointsFromBackendKeypoints(kpDict)
  if (joints) {
    return { bones: buildBones(joints), joints, source: usedFallbackPose ? 'estimated' : 'detected' }
  }
  const estimated = jointsFromProportions(width, height)
  return { bones: buildBones(estimated), joints: estimated, source: 'estimated' }
}

export const BONE_NAMES = BONE_DEFS.map((b) => b.name)
