import React, { useEffect, useRef } from "react";
import * as PIXI from "pixi.js";
import { useEditorStore, TOOL } from "../store/useEditorStore";
import { buildWorldTransforms } from "../store/boneMath";
import {
  buildCutoutSprites,
  updateCutoutTransforms,
  destroyCutoutSprites,
} from "../store/cutoutRig";

const BONE_COLOR = 0x6ee7c9;
const BONE_COLOR_DIM = 0x4a5566;
const SELECTED_COLOR = 0xffd166;
const JOINT_RADIUS = 7;

export default function RiggingEditor() {
  const wrapperRef = useRef(null);
  const pixiRef = useRef(null); // { app, world, sprite, cutoutLayer, cutouts, baseTexture, boneLines, jointsLayer }
  const dragRef = useRef(null); // { boneId, kind: 'end' | 'start' }

  const imageUrl = useEditorStore((s) => s.imageUrl);

  // ---- mount Pixi app once ----
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const app = new PIXI.Application({
      background: 0x15171c,
      resizeTo: wrapper,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    wrapper.appendChild(app.view);

    const world = new PIXI.Container();
    app.stage.addChild(world);
    app.stage.eventMode = "static";
    app.stage.hitArea = app.screen;

    const cutoutLayer = new PIXI.Container();
    const boneLines = new PIXI.Graphics();
    const jointsLayer = new PIXI.Container();
    world.addChild(cutoutLayer);
    world.addChild(boneLines);
    world.addChild(jointsLayer);

    pixiRef.current = {
      app,
      world,
      sprite: null,
      cutoutLayer,
      cutouts: new Map(),
      baseTexture: null,
      boneLines,
      jointsLayer,
    };

    // click on empty canvas -> add bone (in ADD_BONE tool mode)
    app.stage.on("pointerdown", (e) => {
      const { tool, addBone, selectedBoneId, selectBone } =
        useEditorStore.getState();
      if (e.target !== app.stage) return; // a joint/sprite handled its own click
      if (tool === TOOL.ADD_BONE) {
        const local = world.toLocal(e.global);
        addBone({ x: local.x, y: local.y, parentId: selectedBoneId });
      } else {
        selectBone(null);
      }
    });

    // wheel zoom, centered on cursor
    const onWheel = (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const rect = app.view.getBoundingClientRect();
      const cursor = {
        x: (e.clientX - rect.left) * (app.screen.width / rect.width),
        y: (e.clientY - rect.top) * (app.screen.height / rect.height),
      };
      const before = world.toLocal(cursor);
      world.scale.x *= factor;
      world.scale.y *= factor;
      const after = world.toLocal(cursor);
      world.position.x += (after.x - before.x) * world.scale.x;
      world.position.y += (after.y - before.y) * world.scale.y;
    };
    app.view.addEventListener("wheel", onWheel, { passive: false });

    // redraw whenever bones/selection/tool change
    const unsub = useEditorStore.subscribe(() => draw());

    return () => {
      unsub();
      app.view.removeEventListener("wheel", onWheel);
      app.destroy(true, { children: true, texture: true, baseTexture: true });
      pixiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- load / replace the character texture, then build cutout sprites ----
  useEffect(() => {
    if (!imageUrl || !pixiRef.current) return;
    const { app, world } = pixiRef.current;

    let cancelled = false;
    PIXI.Assets.load(imageUrl).then((texture) => {
      if (cancelled || !pixiRef.current) return;
      if (pixiRef.current.sprite) {
        pixiRef.current.sprite.destroy();
      }
      // Flat fallback sprite — stays visible underneath the cutouts so
      // any bone without cutout coverage (custom manual bones, or a
      // detection that didn't produce the named limbs cutouts expect)
      // still shows the artwork instead of empty canvas.
      const sprite = new PIXI.Sprite(texture);
      sprite.eventMode = "none";
      world.addChildAt(sprite, 0);
      pixiRef.current.sprite = sprite;
      pixiRef.current.baseTexture = texture;

      // fit + center
      const { imageWidth, imageHeight } = useEditorStore.getState();
      const w = imageWidth || texture.width;
      const h = imageHeight || texture.height;
      const scale =
        Math.min(app.screen.width / w, app.screen.height / h) * 0.85;
      world.scale.set(scale);
      world.position.set(
        (app.screen.width - w * scale) / 2,
        (app.screen.height - h * scale) / 2
      );

      rebuildCutouts();
      draw();
    });

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  // Builds cutout crop rects from the CURRENT bone pose and caches a
  // signature of which bones existed, so draw() can tell "bones changed
  // shape/rotation" (cheap reposition only) apart from "bone list itself
  // changed" (full rebuild needed — new character, bone added/removed).
  //
  // Deliberately NOT called from inside draw()/on every rotation drag:
  // crop rects must be computed once from a rest pose and then only
  // repositioned, never re-cropped, or the image content would visibly
  // swim inside a moving/resizing window as you rotate a limb.
  function rebuildCutouts() {
    const ctx = pixiRef.current;
    if (!ctx || !ctx.baseTexture) return;
    const { bones, imageWidth, imageHeight } = useEditorStore.getState();

    destroyCutoutSprites(ctx.cutouts);
    ctx.cutoutLayer.removeChildren();

    if (bones.length === 0) return;

    const w = imageWidth || ctx.baseTexture.width;
    const h = imageHeight || ctx.baseTexture.height;
    const cutouts = buildCutoutSprites(ctx.baseTexture, bones, w, h);
    cutouts.forEach(({ sprite }) => ctx.cutoutLayer.addChild(sprite));
    ctx.cutouts = cutouts;
    ctx.cutoutBoneSignature = boneSignature(bones);

    // hide the flat fallback sprite once cutouts cover the character —
    // leaving it visible would double-draw limbs under their cutouts.
    if (ctx.sprite) ctx.sprite.visible = cutouts.size === 0;

    updateCutoutTransforms(ctx.cutouts, bones);
  }

  // Cheap fingerprint of "which bones exist, parented how" — changes only
  // on structural edits (add/remove/reparent), not on rotation/position
  // drags, so draw() can decide whether a full cutout rebuild is needed.
  function boneSignature(bones) {
    return bones
      .map((b) => `${b.id}:${b.name}:${b.parent_id ?? ""}`)
      .sort()
      .join("|");
  }

  function draw() {
    const ctx = pixiRef.current;
    if (!ctx) return;
    const { boneLines, jointsLayer, world, app } = ctx;
    const { bones, selectedBoneId } = useEditorStore.getState();

    // Cutouts: rebuild crop rects only if the bone *list* changed shape
    // (different bones/parents — e.g. a fresh detection load), otherwise
    // just reposition existing sprites to the current pose. This keeps
    // rotation drags cheap (no re-cropping) while still picking up
    // structural edits automatically.
    if (ctx.baseTexture) {
      const sig = boneSignature(bones);
      if (sig !== ctx.cutoutBoneSignature) {
        rebuildCutouts();
      } else if (ctx.cutouts.size > 0) {
        updateCutoutTransforms(ctx.cutouts, bones);
      }
    }

    boneLines.clear();
    jointsLayer.removeChildren();

    if (bones.length === 0) return;

    const byId = Object.fromEntries(bones.map((b) => [b.id, b]));
    const transforms = buildWorldTransforms(bones);

    bones.forEach((bone) => {
      const t = transforms[bone.id];
      if (!t) return;
      const isSelected = bone.id === selectedBoneId;
      const color = isSelected ? SELECTED_COLOR : BONE_COLOR_DIM;

      // bone shaft (tapered triangle look via simple line + small width)
      boneLines.lineStyle(isSelected ? 3 : 2, color, isSelected ? 1 : 0.8);
      boneLines.moveTo(t.startX, t.startY);
      boneLines.lineTo(t.endX, t.endY);

      // start joint
      const startJoint = new PIXI.Graphics();
      startJoint.beginFill(isSelected ? SELECTED_COLOR : BONE_COLOR, 1);
      startJoint.drawCircle(0, 0, JOINT_RADIUS / world.scale.x);
      startJoint.endFill();
      startJoint.position.set(t.startX, t.startY);
      startJoint.eventMode = "static";
      startJoint.cursor = bone.parent_id ? "pointer" : "grab";
      startJoint.on("pointerdown", (e) => {
        e.stopPropagation();
        useEditorStore.getState().selectBone(bone.id);
        if (!bone.parent_id) {
          dragRef.current = { boneId: bone.id, kind: "start" };
          beginDrag();
        }
      });
      jointsLayer.addChild(startJoint);

      // end joint (the "tip" - drag to rotate/resize)
      const endJoint = new PIXI.Graphics();
      endJoint.beginFill(0x0c0e12, 1);
      endJoint.lineStyle(2, isSelected ? SELECTED_COLOR : BONE_COLOR, 1);
      endJoint.drawCircle(0, 0, (JOINT_RADIUS - 2) / world.scale.x);
      endJoint.endFill();
      endJoint.position.set(t.endX, t.endY);
      endJoint.eventMode = "static";
      endJoint.cursor = "crosshair";
      endJoint.on("pointerdown", (e) => {
        e.stopPropagation();
        useEditorStore.getState().selectBone(bone.id);
        dragRef.current = { boneId: bone.id, kind: "end" };
        beginDrag();
      });
      jointsLayer.addChild(endJoint);
    });

    function beginDrag() {
      const onMove = (e) => {
        const drag = dragRef.current;
        if (!drag) return;
        const local = world.toLocal(e.global);
        const { bones: currentBones, updateBone } = useEditorStore.getState();
        const map = Object.fromEntries(currentBones.map((b) => [b.id, b]));
        const bone = map[drag.boneId];
        if (!bone) return;

        if (drag.kind === "start") {
          updateBone(bone.id, { x: local.x, y: local.y });
        } else {
          const t2 = buildWorldTransforms(currentBones);
          const start = t2[bone.id];
          const dx = local.x - start.startX;
          const dy = local.y - start.startY;
          const worldRotation = Math.atan2(dy, dx);
          const length = Math.max(8, Math.hypot(dx, dy));
          const parentWorldRotation = bone.parent_id
            ? t2[bone.parent_id]?.worldRotation ?? 0
            : 0;
          updateBone(bone.id, {
            rotation: worldRotation - parentWorldRotation,
            length,
          });
        }
      };
      const onUp = () => {
        dragRef.current = null;
        app.stage.off("pointermove", onMove);
        app.stage.off("pointerup", onUp);
        app.stage.off("pointerupoutside", onUp);
      };
      app.stage.on("pointermove", onMove);
      app.stage.on("pointerup", onUp);
      app.stage.on("pointerupoutside", onUp);
    }
  }

  return <div ref={wrapperRef} style={{ width: "100%", height: "100%" }} />;
}