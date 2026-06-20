import { BONE_DEFS } from './skeleton.js'

const EPS = 1e-6

function rotate(v, angle) {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c }
}

function closestPointOnSegment(p, a, b) {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const lenSq = abx * abx + aby * aby || EPS
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq
  t = Math.max(0, Math.min(1, t))
  return { x: a.x + abx * t, y: a.y + aby * t, t }
}

/**
 * Builds a uniform quad grid (as triangles) spanning the image, in the exact
 * format PIXI.MeshGeometry wants.
 */
export function buildMeshGrid(width, height, cols = 14, rows = 20) {
  const vCols = cols + 1
  const vRows = rows + 1
  const positions = new Float32Array(vCols * vRows * 2)
  const uvs = new Float32Array(vCols * vRows * 2)
  const restPoints = []

  let p = 0
  for (let j = 0; j < vRows; j++) {
    for (let i = 0; i < vCols; i++) {
      const x = (i / cols) * width
      const y = (j / rows) * height
      positions[p] = x
      uvs[p] = i / cols
      positions[p + 1] = y
      uvs[p + 1] = j / rows
      restPoints.push({ x, y })
      p += 2
    }
  }

  const indices = []
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * vCols + i
      const b = a + 1
      const c = a + vCols
      const d = c + 1
      indices.push(a, b, c, b, d, c)
    }
  }

  return {
    positions,
    uvs,
    indices: new Uint16Array(indices),
    restPoints,
    vCols,
    vRows,
  }
}

/**
 * Bone-ownership skinning with joint-boundary blending.
 *
 * Every vertex is assigned 100% to its closest bone (or blended between two
 * bones at joint boundaries). There is NO global proximity falloff — every
 * vertex, including those at the extremities (feet, hair, hands), follows its
 * bone fully. Background corners are transparent after removeBackground() so
 * deforming them has no visible effect.
 *
 * JOINT_ZONE: fraction of bone length around each end-joint where we smoothly
 * blend to the neighbouring bone (prevents hard seams at joint connections).
 */
export function computeSkinning(restPoints, bones) {
  const boneDefByName = Object.fromEntries(BONE_DEFS.map(d => [d.name, d]))
  const childrenOf = {}
  for (const def of BONE_DEFS) {
    if (def.parent) {
      if (!childrenOf[def.parent]) childrenOf[def.parent] = []
      childrenOf[def.parent].push(def.name)
    }
  }
  const singleChild = {}
  for (const [parent, children] of Object.entries(childrenOf)) {
    if (children.length === 1) singleChild[parent] = children[0]
  }

  const JOINT_ZONE = 0.22

  const localOffsetFor = (boneName, pt) => {
    const b = bones[boneName]
    return rotate(
      { x: pt.x - b.restStart.x, y: pt.y - b.restStart.y },
      -b.restAngle
    )
  }

  return restPoints.map((pt) => {
    // Find owner bone — whichever segment is closest to this vertex
    let minDist = Infinity
    let ownerName = null
    let ownerT = 0

    for (const name of Object.keys(bones)) {
      const bone = bones[name]
      const cp = closestPointOnSegment(pt, bone.restStart, bone.restEnd)
      const dist = Math.hypot(pt.x - cp.x, pt.y - cp.y)
      if (dist < minDist) {
        minDist = dist
        ownerName = name
        ownerT = cp.t
      }
    }

    // Joint-boundary blending — smooth transition between owner and neighbour
    const def = boneDefByName[ownerName]
    let secondaryName = null
    let ownerFraction = 1

    if (ownerT < JOINT_ZONE && def.parent) {
      secondaryName = def.parent
      ownerFraction = ownerT / JOINT_ZONE
    } else if (ownerT > (1 - JOINT_ZONE) && singleChild[ownerName]) {
      secondaryName = singleChild[ownerName]
      ownerFraction = (1 - ownerT) / JOINT_ZONE
    }

    if (secondaryName) {
      return {
        influences: [
          { bone: ownerName,     weight: ownerFraction,     localOffset: localOffsetFor(ownerName,     pt) },
          { bone: secondaryName, weight: 1 - ownerFraction, localOffset: localOffsetFor(secondaryName, pt) },
        ],
        restX: pt.x,
        restY: pt.y,
      }
    }

    return {
      influences: [
        { bone: ownerName, weight: 1, localOffset: localOffsetFor(ownerName, pt) },
      ],
      restX: pt.x,
      restY: pt.y,
    }
  })
}

/**
 * Forward kinematics: computes each bone's world start/end/angle for a
 * given animation pose delta.
 */
export function computeWorldBones(bones, pose) {
  const world = {}
  for (const def of BONE_DEFS) {
    const bone = bones[def.name]
    const delta = pose.bones[def.name] ?? 0
    const angle = bone.restAngle + delta
    let start
    if (def.parent) {
      start = world[def.parent].end
    } else {
      start = { x: bone.restStart.x + pose.root.dx, y: bone.restStart.y + pose.root.dy }
    }
    const end = {
      x: start.x + Math.cos(angle) * bone.length,
      y: start.y + Math.sin(angle) * bone.length,
    }
    world[def.name] = { start, angle, end }
  }
  return world
}

/**
 * Linear blend skinning — every vertex is fully deformed by its bone(s).
 * No proximity falloff: even extremity pixels (feet, hair, tie) follow
 * their owner bone with full weight.
 */
export function deformMesh(skinning, worldBones, outPositions) {
  for (let i = 0; i < skinning.length; i++) {
    const { influences, restX, restY } = skinning[i]
    let x = 0
    let y = 0
    for (const inf of influences) {
      const wb = worldBones[inf.bone]
      const rotated = rotate(inf.localOffset, wb.angle)
      x += (wb.start.x + rotated.x) * inf.weight
      y += (wb.start.y + rotated.y) * inf.weight
    }
    outPositions[i * 2]     = x
    outPositions[i * 2 + 1] = y
  }
  return outPositions
}

/** Character height in px — used to scale animation root-motion amplitude. */
export function getCharacterScale(bones) {
  const top    = bones.head.restEnd.y
  const bottom = Math.max(
    bones.leftLowerLeg.restEnd.y,
    bones.rightLowerLeg.restEnd.y
  )
  return Math.max(1, bottom - top)
}
