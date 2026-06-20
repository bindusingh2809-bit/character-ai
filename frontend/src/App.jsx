import React from "react";
import Sidebar from "./components/Sidebar.jsx";
import Inspector from "./components/Inspector.jsx";
import RiggingEditor from "./components/RiggingEditor.jsx";
import Toolbar from "./components/Toolbar.jsx";
import { useEditorStore } from "./store/useEditorStore.js";

export default function App() {
  const characterId = useEditorStore((s) => s.characterId);
  const characterName = useEditorStore((s) => s.characterName);
  const dirty = useEditorStore((s) => s.dirty);

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="brand">
          Rig<span>Studio</span>
        </div>
        {characterName && <div className="hint">{characterName}</div>}
        <div className="status-pill">
          {characterId ? (dirty ? "Unsaved changes" : "Up to date") : "No character loaded"}
        </div>
      </div>

      <div className="main-area">
        <Sidebar />

        <div className="canvas-area">
          <Toolbar />
          {characterId ? (
            <RiggingEditor />
          ) : (
            <div className="empty-state">
              <h2>Upload a character to start rigging</h2>
              <p>
                PNG or JPEG, ideally with a transparent background. We'll
                try to auto-detect a pose and place starting bones for
                you — then you can refine anything by hand.
              </p>
            </div>
          )}
        </div>

        <Inspector />
      </div>
    </div>
  );
}