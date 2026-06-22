import { AnimationProvider } from './AnimationProvider';
import { parseAnimationPlan } from '../animationModels';

const DEFAULT_BASE_URL = import.meta.env?.VITE_AI_BACKEND_URL || 'http://localhost:8000';
const TIMEOUT_MS = 20000;

/**
 * BackendAnimationProvider — calls the FastAPI backend's /api/generate-animation
 * route, which talks to Portkey → OpenRouter. The browser never holds the
 * Portkey API key.
 */
export class BackendAnimationProvider extends AnimationProvider {
  constructor({ baseUrl = DEFAULT_BASE_URL } = {}) {
  super();
  this.baseUrl = baseUrl.replace(/\/+$/, '');
}

  async generate(prompt) {
    if (!prompt || !prompt.trim()) {
      throw new Error('Prompt is empty.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let res;
    try {
      res = await fetch(`${this.baseUrl}/api/generate-animation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
        signal: controller.signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('The animation generator timed out. Please try again.');
      }
      throw new Error('Could not reach the animation backend. Is it running?');
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      let detail = `Backend error (${res.status}).`;
      try {
        const body = await res.json();
        if (body?.detail) detail = body.detail;
      } catch {
        // ignore — keep generic message
      }
      throw new Error(detail);
    }

    const data = await res.json();
    // Backend already validates with Pydantic, but we re-validate on the
    // client too since this provider is also usable against arbitrary
    // third-party endpoints.
    return parseAnimationPlan(data);
  }
}
