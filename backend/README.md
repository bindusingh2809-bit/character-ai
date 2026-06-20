# Character Animator AI — Python Backend (CPU-friendly, GitHub Codespaces ready)

This replaces the heavy SAM2 + GroundingDINO pipeline with a stack that runs
well on a CPU-only Codespace:

| Step              | Tool                              |
|--------------------|------------------------------------|
| Background removal | `rembg` (U2-Net, ONNX, CPU)        |
| Pose / keypoints   | `mediapipe` Pose (CPU, fast)        |
| Part splitting     | OpenCV distance-transform vs. bone lines (geometric, no model) |
| Mesh + weights     | NumPy grid mesh + inverse-distance bone weights |
| Storage            | Plain files/folders, **no database** |

## Setup in GitHub Codespaces

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

First run will download small ONNX weights for `rembg`/`mediapipe`
(a few MB–dozens of MB) — this needs internet access once, then it's cached
under `~/.u2net` and mediapipe's model cache.

## Run

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Codespaces will prompt to forward port 8000 — make it public/forward it,
then point your existing React app's API base URL at that forwarded URL.

## Endpoints

- `POST /api/upload` (multipart file) → `{project_id, width, height}`
- `GET  /api/projects/{id}` → character.json
- `POST /api/projects/{id}/segment` → runs rembg + pose + part-splitting
- `POST /api/projects/{id}/rig` → builds bones.json from keypoints
- `POST /api/projects/{id}/mesh` → builds mesh.json (grid mesh + weights)
- `POST /api/projects/{id}/animate` → builds animations.json (idle/walk/wave)
- `GET  /api/projects/{id}/status`
- `POST /api/projects/{id}/save` (body: character JSON) → persists edits
- `POST /api/projects/{id}/export` → zips the whole project folder
- `GET  /api/projects/{id}/assets/{part}` → serves a segmented part PNG

Call them in this order from the frontend: upload → segment → rig → mesh →
animate.

## Storage layout (no DB, exactly as specified)

```
storage/
  projects/{project_id}/
    original.png
    character.json
    bones.json
    mesh.json
    animations.json
    status.json
    segmented/  head.png hair.png torso.png arm_left.png ...
    previews/
    exports/
  temp/
```

## Known limitations of this lightweight approach (be aware)

- **Pose detection assumes roughly human proportions.** Very stylized/chibi
  characters may fail MediaPipe detection — in that case the pipeline falls
  back to a generic proportional rig (`used_fallback_pose: true` in the
  segment response) so it still produces *something*, but accuracy will be
  lower. If your characters are very non-human, tell me and I can swap in
  a different keypoint strategy.
- **Part splitting is geometric** (nearest-bone-line), not semantic. It's
  quite good for clean character cutouts with limbs visibly separated from
  the torso, but can mis-assign pixels on baggy clothing/capes/wide skirts
  where the silhouette doesn't hug the limb.
- **Hair extraction is a simple heuristic** (top 35% of head region) — it
  is the roughest part of this pipeline. For better hair separation later,
  the next upgrade step would be a small hair-segmentation model (still
  CPU-feasible, e.g. a MODNet/face-parsing ONNX model), happy to add it.
- **Mesh deformation is rigid-ish**, not learned cloth/skin simulation —
  fine for idle/walk/wave, will look stiff for very dynamic poses.

## Next steps for your React/PixiJS frontend

Your existing `rig.js` / `skeleton.js` / `poseDetector.js` currently do this
client-side with presumably weaker heuristics. I'd suggest:
1. Point `UploadZone.jsx` at `POST /api/upload`.
2. After upload, call segment → rig → mesh → animate in sequence, polling
   `/status` to drive a progress bar.
3. Replace `poseDetector.js`/`skeleton.js`'s output with `bones.json` /
   `mesh.json` fetched from the backend, feeding your `AnimationCanvas.jsx`
   the same shape of data it expects today (or I can rewrite the runtime to
   consume this schema directly — just ask).
