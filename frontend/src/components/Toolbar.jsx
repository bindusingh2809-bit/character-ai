import React from "react";
import { useEditorStore, TOOL } from "../store/useEditorStore";

export default function Toolbar() {
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);
  const characterId = useEditorStore((s) => s.characterId);

  if (!characterId) return null;

  return (
    <div className="toolbar">
      <button
        className={`tool-btn ${tool === TOOL.SELECT ? "active" : ""}`}
        onClick={() => setTool(TOOL.SELECT)}
        title="Select & pose bones"
      >
        ◎ Select
      </button>
      <button
        className={`tool-btn ${tool === TOOL.ADD_BONE ? "active" : ""}`}
        onClick={() => setTool(TOOL.ADD_BONE)}
        title="Click on the canvas to add a bone (parented to the selected bone)"
      >
        ＋ Add Bone
      </button>
    </div>
  );
}
