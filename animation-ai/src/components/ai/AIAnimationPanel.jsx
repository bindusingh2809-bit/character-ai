import React, { useMemo, useState } from 'react';
import { useProjectStore } from '@/store/projectStore';
import { useAnimationStore } from '@/store/animationStore';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Play, Check, RotateCcw, Loader2, AlertTriangle } from 'lucide-react';

import { getAnimationProvider } from '@/ai/providers';
import { parseAnimationPlan, InvalidAnimationPlanError } from '@/ai/animationModels';
import { generateTimeline, UnsupportedActionError } from '@/ai/timelineGenerator';
import { resolveBoneMap } from '@/ai/boneMapping';
import { calibrateRig, getCalibrationWarnings } from '@/ai/motions/rigCalibration';

const PREVIEW_NAME = '__ai_preview__';

export function AIAnimationPanel() {
  const project = useProjectStore(s => s.project);
  const updateProject = useProjectStore(s => s.updateProject);
  const createAnimation = useProjectStore(s => s.createAnimation);
  const deleteAnimation = useProjectStore(s => s.deleteAnimation);

  const switchAnimation = useAnimationStore(s => s.switchAnimation);
  const play = useAnimationStore(s => s.play);

  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | error | ready
  const [error, setError] = useState(null);
  const [plan, setPlan] = useState(null);
  const [previewAnimId, setPreviewAnimId] = useState(null);

  const boneMap = useMemo(() => resolveBoneMap(project.nodes), [project.nodes]);
  const mappedRoleCount = useMemo(
    () => Object.values(boneMap).filter(Boolean).length,
    [boneMap],
  );
  // Measures each limb's real rest direction from rig geometry so motions
  // like "wave" or "point" rotate the right way for THIS character instead
  // of assuming every rig's arm hangs at the same fixed angle.
  const calibration = useMemo(
    () => calibrateRig(boneMap, project.nodes),
    [boneMap, project.nodes],
  );
  const calibrationWarnings = useMemo(
    () => getCalibrationWarnings(calibration),
    [calibration],
  );

  const clearPreview = () => {
    if (previewAnimId) {
      deleteAnimation(previewAnimId);
      setPreviewAnimId(null);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please describe an animation first.');
      setStatus('error');
      return;
    }
    setStatus('loading');
    setError(null);
    clearPreview();

    try {
      const provider = getAnimationProvider();
      const rawPlan = await provider.generate(prompt.trim());
      const validPlan = parseAnimationPlan(rawPlan);
      setPlan(validPlan);
      setStatus('ready');
    } catch (err) {
      console.error('Animation generation failed:', err);
      if (err instanceof InvalidAnimationPlanError) {
        setError(`The AI returned an unusable plan: ${err.message}`);
      } else {
        setError(err.message || 'Something went wrong generating the animation.');
      }
      setStatus('error');
    }
  };

  const buildTimeline = () => {
    if (!plan) return null;
    try {
      return generateTimeline(plan, boneMap, calibration);
    } catch (err) {
      if (err instanceof UnsupportedActionError) {
        setError(`"${err.action}" isn't supported yet.`);
      } else {
        setError(err.message);
      }
      setStatus('error');
      return null;
    }
  };

  const handlePreview = () => {
    const timeline = buildTimeline();
    if (!timeline) return;

    clearPreview();
    createAnimation(PREVIEW_NAME);
    const created = useProjectStore.getState().project.animations.at(-1);
    updateProject((proj) => {
      const anim = proj.animations.find(a => a.id === created.id);
      anim.tracks = timeline.tracks;
      anim.duration = Math.max(timeline.duration, 200);
      anim.isPreview = true;
    }, { skipHistory: true });

    setPreviewAnimId(created.id);
    switchAnimation({ ...created, duration: timeline.duration });
    play();
  };

  const handleApply = () => {
    const timeline = buildTimeline();
    if (!timeline) return;

    // Promote the preview clip (if any) into a real, permanently named clip;
    // otherwise create a fresh one. Either way, the user's existing clips
    // are left untouched until this point.
    const targetId = previewAnimId;
    if (targetId) {
      updateProject((proj) => {
        const anim = proj.animations.find(a => a.id === targetId);
        anim.name = `AI: ${prompt.trim().slice(0, 40)}`;
        anim.tracks = timeline.tracks;
        anim.duration = Math.max(timeline.duration, 200);
        delete anim.isPreview;
      });
      setPreviewAnimId(null);
    } else {
      createAnimation(`AI: ${prompt.trim().slice(0, 40)}`);
      const created = useProjectStore.getState().project.animations.at(-1);
      updateProject((proj) => {
        const anim = proj.animations.find(a => a.id === created.id);
        anim.tracks = timeline.tracks;
        anim.duration = Math.max(timeline.duration, 200);
      });
      switchAnimation({ ...created, duration: timeline.duration });
    }
  };

  const handleRegenerate = () => {
    setPlan(null);
    setStatus('idle');
    clearPreview();
    handleGenerate();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 py-2 border-b shrink-0 flex items-center gap-1.5">
        <Sparkles className="size-3.5 text-muted-foreground" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          AI Animation Generator
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder='Try: "wave with right hand and jump twice"'
          className="min-h-[72px] text-sm resize-none"
          disabled={status === 'loading'}
        />

        {mappedRoleCount === 0 && (
          <div className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
            <span>
              No rig parts were auto-detected (try naming nodes like "Right Arm", "Head", "Left Leg").
              Generated motion may have no visible effect.
            </span>
          </div>
        )}

        {mappedRoleCount > 0 && calibrationWarnings.length > 0 && (
          <div className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
            <span>
              {calibrationWarnings.length === 1
                ? calibrationWarnings[0].message
                : `${calibrationWarnings.length} limbs (${calibrationWarnings.map(w => w.role).join(', ')}) ` +
                  `couldn't be measured from your rig (missing elbow/hand or knee/foot bones) — ` +
                  `directional motions for them may point the wrong way. Map those bones for accurate motion.`}
            </span>
          </div>
        )}

        <Button
          onClick={handleGenerate}
          disabled={status === 'loading' || !prompt.trim()}
          className="w-full"
          size="sm"
        >
          {status === 'loading' ? (
            <Loader2 className="size-4 animate-spin mr-1.5" />
          ) : (
            <Sparkles className="size-4 mr-1.5" />
          )}
          Generate Animation
        </Button>

        {status === 'error' && error && (
          <div className="text-xs text-destructive bg-destructive/10 rounded p-2">
            {error}
          </div>
        )}

        {status === 'ready' && plan && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {plan.actions.map((a, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {a.name}
                  {a.side ? ` (${a.side})` : ''}
                  {a.count ? ` ×${a.count}` : ''}
                </Badge>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button onClick={handlePreview} variant="outline" size="sm">
                <Play className="size-3.5 mr-1.5" />
                Preview
              </Button>
              <Button onClick={handleApply} size="sm">
                <Check className="size-3.5 mr-1.5" />
                Apply To Timeline
              </Button>
            </div>
            <Button onClick={handleRegenerate} variant="ghost" size="sm" className="w-full">
              <RotateCcw className="size-3.5 mr-1.5" />
              Regenerate
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}