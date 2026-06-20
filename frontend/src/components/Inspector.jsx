import React from "react";
import { useEditorStore } from "../store/useEditorStore";
import { saveSkeleton } from "../api";

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

export default function Inspector() {
  const characterId = useEditorStore((s) => s.characterId);
  const characterName = useEditorStore((s) => s.characterName);
  const bones = useEditorStore((s) => s.bones);
  const selectedBoneId = useEditorStore((s) => s.selectedBoneId);
  const selectBone = useEditorStore((s) => s.selectBone);
  const updateBone = useEditorStore((s) => s.updateBone);
  const renameBone = useEditorStore((s) => s.renameBone);
  const deleteBone = useEditorStore((s) => s.deleteBone);
  const dirty = useEditorStore((s) => s.dirty);
  const markSaved = useEditorStore((s) => s.markSaved);
  const imageWidth = useEditorStore((s) => s.imageWidth);
  const imageHeight = useEditorStore((s) => s.imageHeight);

  const selected = bones.find((b) => b.id === selectedBoneId);

  async function handleSave() {
    try {
      await saveSkeleton({
        character_id: characterId,
        name: characterName,
        image_width: imageWidth,
        image_height: imageHeight,
        bones,
      });
      markSaved();
    } catch (err) {
      alert("Save failed: " + (err?.response?.data?.detail ?? err.message));
    }
  }

  if (!characterId) {
    return <div className="inspector" />;
  }

  return (
    <div className="inspector">
      <div className="sidebar-section">
        <h3>Skeleton ({bones.length})</h3>
        {bones.map((b) => (
          <div
            key={b.id}
            className={`bone-row ${b.id === selectedBoneId ? "selected" : ""}`}
            onClick={() => selectBone(b.id)}
          >
            <span>
              {b.parent_id ? "↳ " : ""}
              {b.name}
            </span>
            <span
              className="delete"
              onClick={(e) => {
                e.stopPropagation();
                deleteBone(b.id);
              }}
            >
              ✕
            </span>
          </div>
        ))}
        {bones.length === 0 && (
          <p className="hint">
            Use the "Add Bone" tool and click the canvas to place your first
            bone.
          </p>
        )}
      </div>

      {selected && (
        <div className="sidebar-section">
          <h3>Bone Properties</h3>

          <div className="field">
            <label>Name</label>
            <input
              value={selected.name}
              onChange={(e) => renameBone(selected.id, e.target.value)}
            />
          </div>

          <div className="field">
            <label>Parent</label>
            <select
              value={selected.parent_id ?? ""}
              onChange={(e) =>
                updateBone(selected.id, {
                  parent_id: e.target.value || null,
                })
              }
            >
              <option value="">— none (root) —</option>
              {bones
                .filter((b) => b.id !== selected.id)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </select>
          </div>

          {!selected.parent_id && (
            <>
              <div className="field">
                <label>X</label>
                <input
                  type="number"
                  value={Math.round(selected.x)}
                  onChange={(e) =>
                    updateBone(selected.id, { x: Number(e.target.value) })
                  }
                />
              </div>
              <div className="field">
                <label>Y</label>
                <input
                  type="number"
                  value={Math.round(selected.y)}
                  onChange={(e) =>
                    updateBone(selected.id, { y: Number(e.target.value) })
                  }
                />
              </div>
            </>
          )}

          <div className="field">
            <label>Rotation (deg, relative to parent)</label>
            <input
              type="number"
              value={Math.round(selected.rotation * RAD2DEG)}
              onChange={(e) =>
                updateBone(selected.id, {
                  rotation: Number(e.target.value) * DEG2RAD,
                })
              }
            />
          </div>

          <div className="field">
            <label>Length</label>
            <input
              type="number"
              value={Math.round(selected.length)}
              onChange={(e) =>
                updateBone(selected.id, { length: Number(e.target.value) })
              }
            />
          </div>
        </div>
      )}

      <div className="sidebar-section">
        <button
          className="btn primary"
          style={{ width: "100%" }}
          disabled={!dirty}
          onClick={handleSave}
        >
          {dirty ? "Save Rig" : "Saved"}
        </button>
      </div>
    </div>
  );
}
