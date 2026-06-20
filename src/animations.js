// Every preset is a pure function of normalized time t (0..1, looping) that
// returns a delta rotation (radians, added to each bone's rest angle) and a
// root translation (px, scaled to the character's height so it looks right
// at any image size). Deltas are relative offsets from whatever rest pose
// was detected, so results are most predictable when the source artwork is
// roughly front-facing with arms relaxed at the sides or in a T-pose.

const TAU = Math.PI * 2

function lerp(a, b, t) {
  return a + (b - a) * t
}

// clamp a sine wave to only its positive half (used for one-directional
// motions like a knee bending forward, never backward)
function posSine(phase) {
  return Math.max(0, Math.sin(phase))
}

const walk = {
  id: 'walk',
  label: 'Walking',
  description: 'A steady forward gait loop.',
  loopMs: 900,
  evaluate(t, ctx) {
    const phase = t * TAU
    const armAmp = 0.5
    const legAmp = 0.45
    return {
      bones: {
        spine: 0.03 * Math.sin(phase * 2),
        head: 0.04 * Math.sin(phase * 2 + 0.3),
        leftUpperLeg: legAmp * Math.sin(phase),
        rightUpperLeg: legAmp * Math.sin(phase + Math.PI),
        leftLowerLeg: 0.55 * posSine(phase + Math.PI * 0.55),
        rightLowerLeg: 0.55 * posSine(phase + Math.PI * 1.55),
        leftUpperArm: armAmp * Math.sin(phase + Math.PI),
        rightUpperArm: armAmp * Math.sin(phase),
        leftLowerArm: 0.25 * posSine(phase + Math.PI * 1.2),
        rightLowerArm: 0.25 * posSine(phase + Math.PI * 0.2),
      },
      root: {
        dx: 0,
        dy: -ctx.scale * 0.018 * Math.abs(Math.sin(phase * 2)),
      },
    }
  },
}

const run = {
  id: 'run',
  label: 'Running',
  description: 'A faster, higher-energy sprint cycle.',
  loopMs: 520,
  evaluate(t, ctx) {
    const phase = t * TAU
    const armAmp = 0.85
    const legAmp = 0.8
    return {
      bones: {
        spine: -0.12 + 0.04 * Math.sin(phase * 2),
        head: -0.05 + 0.05 * Math.sin(phase * 2 + 0.3),
        leftUpperLeg: legAmp * Math.sin(phase),
        rightUpperLeg: legAmp * Math.sin(phase + Math.PI),
        leftLowerLeg: 1.0 * posSine(phase + Math.PI * 0.5) + 0.25,
        rightLowerLeg: 1.0 * posSine(phase + Math.PI * 1.5) + 0.25,
        leftUpperArm: armAmp * Math.sin(phase + Math.PI) - 0.3,
        rightUpperArm: armAmp * Math.sin(phase) - 0.3,
        leftLowerArm: 0.9 + 0.3 * posSine(phase + Math.PI * 1.2),
        rightLowerArm: 0.9 + 0.3 * posSine(phase + Math.PI * 0.2),
      },
      root: {
        dx: 0,
        dy: -ctx.scale * 0.04 * Math.abs(Math.sin(phase * 2)) - ctx.scale * 0.01,
      },
    }
  },
}

const jump = {
  id: 'jump',
  label: 'Jumping',
  description: 'Crouch, launch, airborne, land — on repeat.',
  loopMs: 850,
  evaluate(t) {
    const arc = Math.sin(Math.PI * t) // 0 -> 1 -> 0 across the loop
    const crouch = Math.max(0, 1 - t * 6) + Math.max(0, (t - 0.85) * 6) // crouch at start & end
    return {
      bones: {
        spine: -0.1 * arc,
        head: -0.05 * arc,
        leftUpperLeg: 0.35 * crouch - 0.5 * arc * 0.4,
        rightUpperLeg: 0.35 * crouch - 0.5 * arc * 0.4,
        leftLowerLeg: 0.9 * crouch + 0.3 * arc,
        rightLowerLeg: 0.9 * crouch + 0.3 * arc,
        leftUpperArm: -1.4 * arc,
        rightUpperArm: -1.4 * arc,
        leftLowerArm: -0.6 * arc,
        rightLowerArm: -0.6 * arc,
      },
      root: {
        dx: 0,
        dy: -arc * 0.5 * 220 + crouch * 14, // overridden below by ctx.scale version
        _arc: arc,
        _crouch: crouch,
      },
    }
  },
}
// jump needs scale-aware root offset; wrap evaluate so dy scales with character height
const jumpScaled = {
  ...jump,
  evaluate(t, ctx) {
    const out = jump.evaluate(t, ctx)
    const arc = out.root._arc
    const crouch = out.root._crouch
    out.root = {
      dx: 0,
      dy: -arc * ctx.scale * 0.22 + crouch * ctx.scale * 0.05,
    }
    return out
  },
}

const wave = {
  id: 'wave',
  label: 'Waving',
  description: 'A friendly raised-arm wave, idle otherwise.',
  loopMs: 1100,
  evaluate(t, ctx) {
    const phase = t * TAU
    const waveWiggle = Math.sin(phase * 3) // quick wiggle for the wave itself
    const sway = Math.sin(phase)
    return {
      bones: {
        spine: 0.025 * sway,
        head: 0.05 * sway + 0.05 * waveWiggle * 0.2,
        rightUpperArm: -1.35 + 0.08 * waveWiggle,
        rightLowerArm: -0.5 + 0.35 * waveWiggle,
        leftUpperArm: 0.04 * sway,
        leftLowerArm: 0.06 * sway,
        leftUpperLeg: 0.02 * sway,
        rightUpperLeg: -0.02 * sway,
        leftLowerLeg: 0,
        rightLowerLeg: 0,
      },
      root: {
        dx: ctx.scale * 0.006 * sway,
        dy: -ctx.scale * 0.006 * Math.abs(sway),
      },
    }
  },
}

const dance = {
  id: 'dance',
  label: 'Dancing',
  description: 'Hips, arms and head all moving to a beat.',
  loopMs: 700,
  evaluate(t, ctx) {
    const phase = t * TAU
    const beat = Math.sin(phase)
    const beat2 = Math.sin(phase * 2)
    return {
      bones: {
        spine: 0.12 * beat,
        head: -0.1 * beat + 0.05 * Math.sin(phase * 3),
        leftUpperArm: 0.6 * Math.sin(phase + Math.PI * 0.3) - 0.5,
        rightUpperArm: 0.6 * Math.sin(phase + Math.PI * 1.3) - 0.5,
        leftLowerArm: 0.5 + 0.4 * posSine(phase),
        rightLowerArm: 0.5 + 0.4 * posSine(phase + Math.PI),
        leftUpperLeg: 0.18 * beat,
        rightUpperLeg: -0.18 * beat,
        leftLowerLeg: 0.2 * posSine(phase),
        rightLowerLeg: 0.2 * posSine(phase + Math.PI),
      },
      root: {
        dx: ctx.scale * 0.035 * beat,
        dy: -ctx.scale * 0.03 * Math.abs(beat2),
      },
    }
  },
}

export const ANIMATIONS = {
  walk,
  run,
  jump: jumpScaled,
  wave,
  dance,
}

export const ANIMATION_LIST = Object.values(ANIMATIONS)

export function lerpPose(poseA, poseB, t) {
  const bones = {}
  for (const key of Object.keys(poseA.bones)) {
    bones[key] = lerp(poseA.bones[key] ?? 0, poseB.bones[key] ?? 0, t)
  }
  return {
    bones,
    root: {
      dx: lerp(poseA.root.dx, poseB.root.dx, t),
      dy: lerp(poseA.root.dy, poseB.root.dy, t),
    },
  }
}
