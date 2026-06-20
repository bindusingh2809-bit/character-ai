// Thin client for the Python backend (FastAPI). Base URL comes from
// VITE_API_URL (set this in .env or .env.local), defaulting to localhost
// for local dev / a same-host Codespaces port-forward.
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function asJson(res) {
  if (!res.ok) {
    let detail = res.statusText
    try { detail = (await res.json()).detail ?? detail } catch { /* ignore */ }
    throw new Error(`API ${res.status}: ${detail}`)
  }
  return res.json()
}

/** Quick reachability check — used so the UI can fall back gracefully
 * if the backend isn't running (e.g. user hasn't started it in Codespaces). */
export async function isBackendAvailable(timeoutMs = 1500) {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    const res = await fetch(`${BASE_URL}/health`, { signal: ctrl.signal })
    clearTimeout(t)
    return res.ok
  } catch {
    return false
  }
}

export async function uploadImage(file) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE_URL}/api/upload`, { method: 'POST', body: form })
  return asJson(res) // { project_id, width, height }
}

export async function runSegment(projectId) {
  const res = await fetch(`${BASE_URL}/api/projects/${projectId}/segment`, { method: 'POST' })
  return asJson(res) // { keypoints, used_fallback_pose, parts, width, height }
}

export async function runRig(projectId) {
  const res = await fetch(`${BASE_URL}/api/projects/${projectId}/rig`, { method: 'POST' })
  return asJson(res) // { bones: [...] }
}

export async function runMesh(projectId) {
  const res = await fetch(`${BASE_URL}/api/projects/${projectId}/mesh`, { method: 'POST' })
  return asJson(res)
}

export async function runAnimate(projectId) {
  const res = await fetch(`${BASE_URL}/api/projects/${projectId}/animate`, { method: 'POST' })
  return asJson(res)
}

export function cutoutUrl(projectId) {
  return `${BASE_URL}/api/projects/${projectId}/cutout`
}

export function exportUrl(projectId) {
  return `${BASE_URL}/api/projects/${projectId}/export`
}

/**
 * Runs the full pipeline (upload already done) and returns everything the
 * JointEditor needs: keypoints in the {name: [x,y]} shape, and whether a
 * fallback proportional rig was used.
 */
export async function segmentProject(projectId) {
  const result = await runSegment(projectId)
  return result
}
