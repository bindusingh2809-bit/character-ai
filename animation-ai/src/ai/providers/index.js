import { MockAnimationProvider } from './MockAnimationProvider';
import { BackendAnimationProvider } from './BackendAnimationProvider';

/**
 * Returns the active AnimationProvider. Business code (the AI panel) should
 * only ever call getAnimationProvider() — never import a concrete provider
 * directly — so swapping Portkey for Ollama/OpenAI/etc. later is a one-line
 * change here.
 *
 * mode: 'backend' (Portkey/OpenRouter via FastAPI) | 'mock' (offline, local)
 */
export function getAnimationProvider(mode = import.meta.env?.VITE_AI_PROVIDER || 'backend') {
  switch (mode) {
    case 'mock':
      return new MockAnimationProvider();
    case 'backend':
    default:
      return new BackendAnimationProvider();
  }
}
