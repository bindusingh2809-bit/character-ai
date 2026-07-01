/**
 * Client-side storage for a user's "bring your own key" (BYOK) LLM config.
 *
 * Deliberately kept out of the project store / save-load system: it must
 * never end up inside an exported .rig/.json project file, an undo/redo
 * snapshot, or a synced project. It lives only in this browser's
 * localStorage, scoped to this origin.
 */

const STORAGE_KEY = 'stretchy_studio_byok_v1';

// Keep model ids reasonably current, but treat these as *starting points* —
// providers rename/retire models often, so the UI also lets the user type
// their own model override.
export const BYOK_PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic (Claude)', defaultModel: 'claude-haiku-4-5-20251001' },
  { id: 'openai', label: 'OpenAI (GPT)', defaultModel: 'gpt-4.1-mini' },
  { id: 'gemini', label: 'Google (Gemini)', defaultModel: 'gemini-2.5-flash-lite' },
];

export function getByokProviderMeta(providerId) {
  return BYOK_PROVIDERS.find(p => p.id === providerId) || null;
}

/** Returns { provider, apiKey, model } or null if nothing is configured. */
export function getByokConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.provider || !parsed?.apiKey) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setByokConfig({ provider, apiKey, model }) {
  if (!provider || !apiKey) {
    throw new Error('provider and apiKey are both required.');
  }
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ provider, apiKey, model: model || null }),
  );
}

export function clearByokConfig() {
  localStorage.removeItem(STORAGE_KEY);
}
