import { create } from "zustand";
import { uid } from "./boneMath";

export const TOOL = {
  SELECT: "select",
  ADD_BONE: "add_bone",
};

export const useEditorStore = create((set, get) => ({
  // character + image
  characterId: null,
  characterName: null,
  imageUrl: null,
  imageWidth: 0,
  imageHeight: 0,

  // rig data
  bones: [],
  selectedBoneId: null,
  tool: TOOL.SELECT,
  dirty: false,

  loadFromSkeleton(skeleton, imageUrl) {
    set({
      characterId: skeleton.character_id,
      characterName: skeleton.name,
      imageUrl,
      imageWidth: skeleton.image_width,
      imageHeight: skeleton.image_height,
      bones: skeleton.bones,
      selectedBoneId: skeleton.bones[0]?.id ?? null,
      tool: TOOL.SELECT,
      dirty: false,
    });
  },

  reset() {
    set({
      characterId: null,
      characterName: null,
      imageUrl: null,
      bones: [],
      selectedBoneId: null,
      dirty: false,
    });
  },

  setTool(tool) {
    set({ tool });
  },

  selectBone(id) {
    set({ selectedBoneId: id });
  },

  addBone({ x, y, parentId }) {
    const newBone = {
      id: uid(),
      name: `bone_${get().bones.length + 1}`,
      parent_id: parentId ?? null,
      x,
      y,
      rotation: 0,
      length: 60,
    };
    set((s) => ({
      bones: [...s.bones, newBone],
      selectedBoneId: newBone.id,
      dirty: true,
    }));
    return newBone.id;
  },

  updateBone(id, patch) {
    set((s) => ({
      bones: s.bones.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      dirty: true,
    }));
  },

  renameBone(id, name) {
    get().updateBone(id, { name });
  },

  deleteBone(id) {
    set((s) => {
      // also re-parent any children to the deleted bone's parent
      // (so the chain doesn't break), then remove it.
      const target = s.bones.find((b) => b.id === id);
      const bones = s.bones
        .filter((b) => b.id !== id)
        .map((b) =>
          b.parent_id === id
            ? { ...b, parent_id: target?.parent_id ?? null }
            : b
        );
      return {
        bones,
        selectedBoneId: s.selectedBoneId === id ? null : s.selectedBoneId,
        dirty: true,
      };
    });
  },

  markSaved() {
    set({ dirty: false });
  },
}));
