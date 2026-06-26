/**
 * SkinsPanel.jsx
 *
 * UI for the character skin system.
 * Lets the user:
 *   - See which skins have been imported
 *   - Switch the active skin (or go back to the base)
 *   - Import a new PSD as an additional skin
 *   - Delete / rename a skin
 *
 * Props:
 *   onImportSkin(file, skinId)  – called when user picks a file + skin name
 *   project                     – projectStore.project (reads skins, activeSkin)
 *   setActiveSkin(skinId|null)  – from projectStore
 *   deleteSkin(skinId)          – from projectStore
 *   renameSkin(oldId, newId)    – from projectStore
 */
import { useRef, useState } from 'react';
import { Plus, Trash2, Edit2, Check, X, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function SkinsPanel({ onImportSkin, project, setActiveSkin, deleteSkin, renameSkin }) {
  const fileInputRef = useRef(null);
  const [pendingSkinId, setPendingSkinId] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [importError, setImportError] = useState('');

  const skins = project?.skins ?? {};
  const activeSkin = project?.activeSkin ?? null;
  const skinIds = Object.keys(skins);

  // ── handlers ──────────────────────────────────────────────────────────────

  const handleFileChosen = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!pendingSkinId.trim()) { setImportError('Enter a skin name first.'); return; }
    setImportError('');
    setShowNewForm(false);
    onImportSkin(file, pendingSkinId.trim());
    setPendingSkinId('');
  };

  const startImport = () => {
    if (!pendingSkinId.trim()) { setImportError('Enter a skin name.'); return; }
    setImportError('');
    fileInputRef.current?.click();
  };

  const handleRenameConfirm = (oldId) => {
    const newId = renameValue.trim();
    if (!newId || newId === oldId) { setRenamingId(null); return; }
    renameSkin(oldId, newId);
    setRenamingId(null);
  };

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-2 p-3 text-sm">
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold flex items-center gap-1.5 text-foreground">
          <Layers size={14} /> Skins
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          onClick={() => { setShowNewForm(v => !v); setImportError(''); }}
        >
          <Plus size={12} className="mr-1" /> Add skin
        </Button>
      </div>

      {/* New skin form */}
      {showNewForm && (
        <div className="flex flex-col gap-1.5 p-2 rounded border border-border bg-muted/40">
          <label className="text-xs text-muted-foreground">Skin name (e.g. "side", "back")</label>
          <Input
            value={pendingSkinId}
            onChange={e => setPendingSkinId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && startImport()}
            placeholder="side"
            className="h-7 text-xs"
            autoFocus
          />
          {importError && <p className="text-xs text-destructive">{importError}</p>}
          <p className="text-xs text-muted-foreground">
            Choose a <strong>layered PSD</strong> (same layer names as the base) or a
            <strong>flat PNG</strong> (auto-segmented via AI) of the character
            facing a different direction.
          </p>
          <div className="flex gap-1.5 mt-1">
            <Button size="sm" className="h-7 text-xs flex-1" onClick={startImport}>
              Choose PSD…
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => { setShowNewForm(false); setImportError(''); setPendingSkinId(''); }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".psd,image/*"
        className="hidden"
        onChange={handleFileChosen}
      />

      {/* Base skin row */}
      <SkinRow
        label="Base (original)"
        isActive={activeSkin === null}
        onActivate={() => setActiveSkin(null)}
      />

      {/* Imported skin rows */}
      {skinIds.map(id => (
        <div key={id} className="flex items-center gap-1">
          {renamingId === id ? (
            <div className="flex items-center gap-1 flex-1">
              <Input
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleRenameConfirm(id); if (e.key === 'Escape') setRenamingId(null); }}
                className="h-6 text-xs flex-1"
                autoFocus
              />
              <button className="p-0.5 hover:text-primary" onClick={() => handleRenameConfirm(id)}><Check size={12} /></button>
              <button className="p-0.5 hover:text-destructive" onClick={() => setRenamingId(null)}><X size={12} /></button>
            </div>
          ) : (
            <SkinRow
              label={id}
              isActive={activeSkin === id}
              onActivate={() => setActiveSkin(id)}
              partCount={Object.keys(skins[id] ?? {}).length}
              onRename={() => { setRenamingId(id); setRenameValue(id); }}
              onDelete={() => { if (confirm(`Delete skin "${id}"?`)) deleteSkin(id); }}
            />
          )}
        </div>
      ))}

      {skinIds.length === 0 && !showNewForm && (
        <p className="text-xs text-muted-foreground text-center py-3">
          No skins yet. Import a side-facing PSD to add one.
        </p>
      )}
    </div>
  );
}

function SkinRow({ label, isActive, onActivate, partCount, onRename, onDelete }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer select-none transition-colors',
        isActive
          ? 'bg-primary/15 text-primary font-medium'
          : 'hover:bg-muted/60 text-foreground'
      )}
      onClick={onActivate}
    >
      <span className={cn(
        'w-2 h-2 rounded-full border flex-shrink-0',
        isActive ? 'bg-primary border-primary' : 'border-muted-foreground'
      )} />
      <span className="flex-1 truncate text-xs">{label}</span>
      {partCount !== undefined && (
        <span className="text-xs text-muted-foreground">{partCount}p</span>
      )}
      {onRename && (
        <button
          className="p-0.5 opacity-40 hover:opacity-100 hover:text-foreground"
          onClick={e => { e.stopPropagation(); onRename(); }}
          title="Rename skin"
        >
          <Edit2 size={11} />
        </button>
      )}
      {onDelete && (
        <button
          className="p-0.5 opacity-40 hover:opacity-100 hover:text-destructive"
          onClick={e => { e.stopPropagation(); onDelete(); }}
          title="Delete skin"
        >
          <Trash2 size={11} />
        </button>
      )}
    </div>
  );
}