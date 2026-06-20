# Rig Studio — MVP Scaffold

A working, runnable slice of the platform from the planning doc:

**Upload a PNG/JPEG → place bones by hand on a PixiJS canvas → save your
own rig format (`skeleton.json`) → reload it later.**

This is step one of three from the plan:

1. ✅ Upload → manual bones → animate-ready skeleton *(this scaffold)*
2. ⬜ Auto bones (SAM segmentation + rule-based skeleton from YOLO class) + IK
3. ⬜ AI-generated actions / animation suggestions

---

## Project layout

```
rig-platform/
├── backend/                  FastAPI app
│   ├── app/
│   │   ├── main.py           App entrypoint, CORS, static file mount
│   │   ├── models.py         Pydantic schemas — this IS your rig format
│   │   ├── storage.py        Filesystem read/write for character folders
│   │   └── routers/
│   │       └── characters.py upload / get / save-skeleton / list / delete
│   ├── storage/characters/   Uploaded images + skeleton.json live here
│   └── requirements.txt
│
└── frontend/                 React + Vite app
    └── src/
        ├── App.jsx
        ├── api.js                  axios client for the backend
        ├── store/
        │   ├── useEditorStore.js   zustand store (bones, selection, tool)
        │   └── boneMath.js         parent-chain world transform math
        └── components/
            ├── Sidebar.jsx         upload + character library
            ├── RiggingEditor.jsx   PixiJS canvas — bone placement & posing
            ├── Toolbar.jsx         Select / Add Bone tool switch
            └── Inspector.jsx       bone tree + property editor + save
```

## The rig format (`skeleton.json`)

This is your "Universal Rig Format" from the plan — independent of Spine /
DragonBones, simple enough to extend later with meshes + weights:

```json
{
  "character_id": "4bf3aadef484",
  "name": "TestHero",
  "image_width": 200,
  "image_height": 300,
  "bones": [
    { "id": "root1", "name": "root", "parent_id": null,
      "x": 100, "y": 150, "rotation": 0, "length": 80 },
    { "id": "arm1", "name": "arm", "parent_id": "root1",
      "x": 0, "y": 0, "rotation": 0.5, "length": 40 }
  ]
}
```

Root bones store an absolute `(x, y)`. Child bones start at their parent's
tip — `rotation` is always relative to the parent, which is what makes
posing/animating a chain (and eventually IK) straightforward.

## Running it locally

**Backend** (needs Python 3.10+):

```bash
cd backend
cp .env.example .env          # adjust values if needed, defaults work out of the box
python3 -m venv .venv && source .venv/bin/activate   # optional but recommended
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Frontend** (needs Node 18+), in a second terminal:

```bash
cd frontend
cp .env.example .env          # only needed if you're NOT using the dev proxy — see below
npm install
npm run dev
```

Open **http://localhost:5173**. The Vite dev server proxies `/api` and
`/media` to the backend on port 8000, so both need to be running.

## Configuration (.env)

Both `backend/` and `frontend/` have a `.env.example` — copy each to `.env`
and adjust. `.env` is gitignored; `.env.example` is the template that's
safe to commit.

**Backend** (`backend/.env`, read via `app/config.py`):

| Variable | Default | What it does |
|---|---|---|
| `CORS_ALLOW_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated exact origins allowed to call the API |
| `CORS_ALLOW_ORIGIN_REGEX` | `https://.*\.app\.github\.dev` | Regex for forwarded-port dev environments (Codespaces, etc.) |
| `STORAGE_DIR` | `storage/characters` | Where character folders are written; relative paths resolve under `backend/` |
| `MAX_UPLOAD_BYTES` | `15728640` (15 MB) | Upload size limit, enforced in the upload route |

**Frontend** (`frontend/.env`, read via `import.meta.env` in `src/api.js`):

| Variable | Default | What it does |
|---|---|---|
| `VITE_API_BASE_URL` | unset → falls back to `/api` (the Vite proxy) | Only set this if the frontend needs to reach a backend the proxy can't reach — e.g. a separately deployed production API. Leave it unset for local dev and Codespaces. |

If you don't create a `.env` at all, both sides fall back to the defaults
above — which is exactly what local dev and Codespaces use.

## Running it in GitHub Codespaces

Same two commands as above, run in two terminal panes. A couple of
Codespaces-specific things are already handled in this scaffold:

- `frontend/vite.config.js` sets `server.host: true` so the Vite dev
  server binds to `0.0.0.0` — without this, Codespaces' port forwarding
  can't reach it (Vite defaults to binding only to loopback).
- `backend/app/main.py` allows CORS from `*.app.github.dev` in addition to
  `localhost`, in case you ever hit the API directly through its own
  forwarded URL (e.g. opening `/docs`).

Steps:

1. Run the backend command in one terminal, frontend command in another.
2. Codespaces will detect both ports (8000, 5173) and pop up a notification
   — open the **5173** one (or check the **Ports** tab and click the globe
   icon next to it). That's the app.
3. **First time only:** in the Ports tab, right-click port 5173 → **Port
   Visibility** → set to **Public** if you want to share the link with
   others, or leave it **Private** to keep it behind your GitHub login.
   Port 8000 doesn't need to be public — the frontend reaches it through
   the Vite proxy *inside* the container, not over the public internet.
4. Because the proxy in `vite.config.js` talks to `http://localhost:8000`
   server-side (inside the same container, not through the browser), no
   URL rewriting is needed even though the browser itself sees a
   `https://<name>-5173.app.github.dev` address.

If `npm run dev` reports the port forwarding didn't pick up automatically,
check the **Ports** tab in the Codespaces UI — sometimes you need to wait a
few seconds after the dev server starts for the forward to register.

## Using the editor

1. **Upload** a PNG/JPEG in the left sidebar. A character is created with a
   single root bone in the middle of the image.
2. **Select** tool (default): click a bone's outlined tip-handle and drag to
   rotate/resize it. Drag a root bone's filled handle to move the whole rig.
3. **Add Bone** tool: click anywhere on the canvas to add a new bone,
   parented to whichever bone is currently selected (so build chains by
   selecting the previous bone first — e.g. select `spine`, click to add
   `left_arm`).
4. Use the **Inspector** panel (right) to rename bones, reparent them, or
   type exact numbers. Click **Save Rig** to persist `skeleton.json`.
5. Scroll to zoom; characters persist in `backend/storage/characters/` and
   reappear in the sidebar list on reload.

## Wiring in the next pieces from the plan

- **SAM auto-segmentation**: add a `/api/segment` route that runs SAM on
  the uploaded image server-side (Python/PyTorch, on CPU this will be slow —
  expect tens of seconds per image, consider a quantized/mobile SAM variant
  or batching it as a background job rather than a blocking request) and
  returns mask layers; the frontend can offer them as separate texture
  pieces to drag bones onto.
- **YOLO character-type detection**: another route that classifies the
  upload (human/dog/etc.) and returns a *bone template* (`default_skeleton`
  in `storage.py` is exactly the place to branch on that — replace the
  single root bone with a template chain for the detected type).
- **IK (CCD)**: lives entirely in `boneMath.js` — add a function that, given
  a target point and a bone chain, iteratively rotates each bone toward the
  target, then call it instead of `updateBone` when the user drags a chain's
  end effector with an "IK" tool enabled.
- **DragonBones / Spine import**: a converter that maps their JSON bone
  arrays into this `Skeleton`/`Bone` shape — since the frontend only cares
  about `parent_id / x / y / rotation / length`, anything that can be
  reduced to that shape plugs into the same renderer.
- **Animations**: a sibling `animations.json` per character storing named
  keyframe tracks per bone (`{ time, rotation, length }`); the timeline UI
  would scrub a `t` value and interpolate per-bone rotation/length before
  calling the same `buildWorldTransforms`.

## Notes on the CPU-only AI plan

Since you're on CPU for now: SAM and YOLO will both run, but SAM in
particular is slow without a GPU (full ViT-H SAM can take 10s+ per image on
CPU). Two practical paths when you get there:
- Use **MobileSAM** or **FastSAM** instead of the full SAM checkpoint —
  both are CPU-friendlier and designed as drop-in replacements.
- Run segmentation as an async background job (return a job id from
  `/api/segment`, poll for completion) rather than blocking the upload
  request, so the UI stays responsive either way.
