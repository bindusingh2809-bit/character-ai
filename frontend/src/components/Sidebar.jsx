import React, { useEffect, useRef, useState } from "react";
import {
  uploadCharacter,
  listCharacters,
  getCharacter,
  deleteCharacter,
  saveSkeleton,
} from "../api";
import { useEditorStore } from "../store/useEditorStore";
import { detectBonesFromImage } from "../store/poseDetect";

export default function Sidebar() {
  const [characters, setCharacters] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const fileInputRef = useRef(null);
  const characterId = useEditorStore((s) => s.characterId);
  const loadFromSkeleton = useEditorStore((s) => s.loadFromSkeleton);

  async function refresh() {
    try {
      const list = await listCharacters();
      setCharacters(list);
    } catch (err) {
      console.error("Failed to list characters", err);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleFileChosen(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const name = file.name.replace(/\.[^.]+$/, "");
    setUploading(true);
    try {
      const meta = await uploadCharacter(name, file);
      const skeleton = await getCharacter(meta.id);

      // Try to auto-place bones from the uploaded image before handing
      // the skeleton to the editor. If detection fails or finds nothing
      // confident, we just keep the backend's default single-root-bone
      // skeleton — manual placement still works exactly as before.
      setDetecting(true);
      try {
        const detectedBones = await detectFromUrl(meta.image_url);
        if (detectedBones && detectedBones.length > 0) {
          skeleton.bones = detectedBones;
          // persist the auto-placed rig so it's not lost if the user
          // navigates away before manually saving
          await saveSkeleton(skeleton);
        }
      } catch (detectErr) {
        // Detection is a nice-to-have, not a hard requirement — fall back
        // to the manual default skeleton silently except for a console log.
        console.warn("Pose auto-detect failed, falling back to manual placement", detectErr);
      } finally {
        setDetecting(false);
      }

      loadFromSkeleton(skeleton, meta.image_url);
      await refresh();
    } catch (err) {
      console.error(err);
      alert("Upload failed: " + (err?.response?.data?.detail ?? err.message));
    } finally {
      setUploading(false);
    }
  }

  function detectFromUrl(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        detectBonesFromImage(img).then(resolve).catch(reject);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  async function openCharacter(c) {
    const skeleton = await getCharacter(c.id);
    loadFromSkeleton(skeleton, c.image_url);
  }

  async function removeCharacter(id, e) {
    e.stopPropagation();
    if (!confirm("Delete this character and its rig? This can't be undone.")) {
      return;
    }
    await deleteCharacter(id);
    await refresh();
    if (characterId === id) useEditorStore.getState().reset();
  }

  return (
    <div className="sidebar">
      <div className="sidebar-section">
        <h3>New Character</h3>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg"
          style={{ display: "none" }}
          onChange={handleFileChosen}
        />
        <button
          className="btn primary"
          style={{ width: "100%" }}
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading
            ? detecting
              ? "Detecting pose…"
              : "Uploading…"
            : "Upload PNG / JPEG"}
        </button>
        <p className="hint" style={{ marginTop: 8 }}>
          Transparent PNGs work best. We'll try to auto-place bones from a
          detected pose (works best on human-proportioned characters) —
          nudge anything that's off with the manual tools afterward.
        </p>
      </div>

      <div className="sidebar-section" style={{ flex: 1 }}>
        <h3>Characters</h3>
        {characters.length === 0 && (
          <p className="hint">No characters yet — upload one above.</p>
        )}
        {characters.map((c) => (
          <div
            key={c.id}
            className={`char-list-item ${c.id === characterId ? "active" : ""}`}
            onClick={() => openCharacter(c)}
          >
            <img src={c.image_url} alt={c.name} />
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div
                style={{
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                }}
              >
                {c.name}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-1)" }}>
                {c.bone_count} bone{c.bone_count === 1 ? "" : "s"}
              </div>
            </div>
            <span
              className="delete"
              style={{ color: "var(--danger)", fontSize: 12 }}
              onClick={(e) => removeCharacter(c.id, e)}
            >
              ✕
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}