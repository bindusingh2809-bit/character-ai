import * as tf from '@tensorflow/tfjs'
import '@tensorflow/tfjs-backend-webgl'
import * as poseDetection from '@tensorflow-models/pose-detection'

let detectorPromise = null

/**
 * Lazily creates (and caches) a MoveNet Lightning detector. Lightning is the
 * smallest MoveNet variant (~5MB) — picked deliberately over BlazePose so the
 * model loads fast and runs comfortably on a laptop GPU/CPU with no setup.
 * The model weights are fetched from Google's public TF Hub CDN the first
 * time this runs; nothing is downloaded or installed manually.
 */
export async function getDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      await tf.setBackend('webgl')
      await tf.ready()
      return poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
        modelType: poseDetection.movenet.modelType.SINGLE_POSE_LIGHTNING,
      })
    })()
  }
  return detectorPromise
}

/**
 * Runs pose estimation on a single static image (an HTMLImageElement that is
 * already loaded). Returns the raw keypoints array (COCO-17, pixel space) or
 * null if no person was found with reasonable confidence.
 */
export async function detectPoseFromImage(imageEl) {
  const detector = await getDetector()
  const poses = await detector.estimatePoses(imageEl, {
    flipHorizontal: false,
  })
  if (!poses || poses.length === 0) return null
  // Pick the highest-confidence pose if more than one is found.
  const best = poses.reduce((a, b) => {
    const scoreA = a.score ?? avgScore(a.keypoints)
    const scoreB = b.score ?? avgScore(b.keypoints)
    return scoreB > scoreA ? b : a
  })
  return best.keypoints
}

function avgScore(keypoints) {
  const scores = keypoints.map((k) => k.score ?? 0)
  return scores.reduce((s, v) => s + v, 0) / scores.length
}
