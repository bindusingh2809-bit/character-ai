# AI Animation Generator

Prompt → Animation for Stretchy Studio. Type a description ("wave with right hand
and jump twice") and get real bone keyframes applied to the existing timeline —
no images, video, or per-frame generation involved.

## Flow

```
User Prompt → AI Animation Panel (React)
            → AnimationProvider.generate()
                 mock:    local keyword parser, no network
                 backend: FastAPI → Portkey → OpenRouter model
            → AnimationPlan JSON ({ actions: [...] })
            → Pydantic / parseAnimationPlan() validation
            → boneMapping.resolveBoneMap()  (role → actual rig nodeId)
            → timelineGenerator.generateTimeline()
            → motion templates (src/ai/motions)
            → { tracks, duration } keyframes
            → Preview (temp hidden clip) or Apply (real clip) in project.animations
```

The LLM **never** touches bone names or rotation values — it only ever picks from
the fixed action vocabulary (`idle`, `walk`, `run`, `jump`, `wave`, `point`, `clap`,
`dance`, `celebrate`, `sit`, `look_left`, `look_right`, `nod`, `shake_head`), with
optional `duration` (seconds), `side` (`left`/`right`), `count`. All keyframes are
generated locally by the motion template library, then validated again before
they're allowed into the timeline.

## New files (frontend)

```
src/ai/
  boneMapping.js            role → nodeId auto-detection + override merge
  animationModels.js        runtime validation of the AnimationPlan JSON
  timelineGenerator.js       sequences actions into merged, offset tracks
  motions/
    motionUtils.js           track/keyframe helper functions
    motionLibrary.js         createXMotion() for every supported action
  providers/
    AnimationProvider.js     interface
    MockAnimationProvider.js offline/local rule-based provider
    BackendAnimationProvider.js  calls the FastAPI backend
    index.js                 getAnimationProvider() factory
src/components/ai/
  AIAnimationPanel.jsx       the UI panel (textarea, generate/preview/apply/regenerate)
```

## Modified files (frontend)

- `src/app/layout/EditorLayout.jsx` — added a tab strip ("Animations" / "AI Generator")
  next to the existing AnimationListPanel so the new panel reuses the same sidebar slot.
- `src/components/animation/AnimationListPanel.jsx` — hides the internal `isPreview`
  clip used for the Preview button.

## New files (backend)

```
backend/
  main.py                          FastAPI app, /api/generate-animation route
  models/animation_models.py       Pydantic AnimationPlan / AnimationAction
  providers/base.py                AnimationProvider ABC
  providers/portkey_provider.py    Portkey → OpenRouter call + JSON validation
  providers/mock_provider.py       offline rule-based provider (no API key needed)
  services/animation_service.py    provider selection, timeouts, error wrapping
  requirements.txt
  .env.example
```

## Running the backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # or your preferred env tool
pip install -r requirements.txt
cp .env.example .env
# Fill in PORTKEY_API_KEY and OPENROUTER_MODEL in .env,
# or set ANIMATION_PROVIDER=mock to run with no API key at all.
uvicorn backend.main:app --reload --port 8000
```

## Running the frontend

```bash
cp .env.example .env          # adjust VITE_AI_BACKEND_URL / VITE_AI_PROVIDER if needed
npm install
npm run dev
```

With `VITE_AI_PROVIDER=mock`, the panel works fully offline with no backend running —
useful for demos or rigs without a Portkey key configured yet.

## Rig requirement: bone mapping

This rig format doesn't have fixed bone names (it's a flat node graph of named
groups/parts). `boneMapping.js` auto-detects roles (`rightArm`, `leftLeg`, `head`,
`body`, `root`, ...) from node names containing common patterns (e.g. "Right Arm",
"arm_r", "Head"). If your character's parts use different names, the panel will warn
that 0 roles were mapped — rename the relevant nodes, or extend `ROLE_PATTERNS` /
wire up a manual override UI on top of `resolveBoneMap(nodes, overrides)`.

## Error handling

- Empty prompt → inline message, no request sent.
- Backend unreachable / timeout → friendly error, "Regenerate" retries.
- Invalid/hallucinated JSON from the LLM → rejected by Pydantic server-side and by
  `parseAnimationPlan()` client-side before it can reach the timeline generator.
- Unsupported action name → `UnsupportedActionError`, surfaced in the panel.

## Extensibility (future phases, not implemented)

`AnimationProvider` (both frontend and backend) is the only seam business code
depends on, so adding `OllamaProvider`, a direct `OpenAIProvider`, motion blending,
procedural animation, MotionGPT, diffusion-based text-to-motion, or video retargeting
later means adding a new provider/module behind these same interfaces — no changes
to the panel, timeline generator, or motion library contracts.
