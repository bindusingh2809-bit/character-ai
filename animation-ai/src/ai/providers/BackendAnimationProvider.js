import { AnimationProvider } from './AnimationProvider';
import { parseAnimationPlan } from '../animationModels';
import { getByokConfig } from '../apiKeyStore';

const DEFAULT_BASE_URL = import.meta.env?.VITE_AI_BACKEND_URL || 'http://localhost:8000';
// 130s — CPU-only inference in constrained environments (e.g. GitHub
// Codespaces, no GPU) can be considerably slower than a hosted API.
const TIMEOUT_MS = 130000;

/**
 * BackendAnimationProvider — calls the FastAPI backend's /api/generate-animation
 * route, which talks to Portkey → OpenRouter. The browser never holds the
 * Portkey API key.
 */
export class BackendAnimationProvider extends AnimationProvider {
  constructor({ baseUrl = DEFAULT_BASE_URL } = {}) {
    super();
    // Strip any trailing slash(es) so `${baseUrl}/api/...` never produces
    // a double slash (e.g. "http://host:8000/" + "/api/..." -> "...//api/...",
    // which FastAPI 404s on since it doesn't normalize double slashes).
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async generate(prompt) {
    if (!prompt || !prompt.trim()) {
      throw new Error('Prompt is empty.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    // If the user has entered their own API key (Settings > AI Provider),
    // route this request through that instead of the server's own
    // Portkey/Ollama budget. The key is sent once, over HTTPS, straight to
    // this backend, which forwards it to the provider and does not persist
    // it anywhere.
    const byok = getByokConfig();
    const body = { prompt };
    if (byok) {
      body.provider = byok.provider;
      body.api_key = byok.apiKey;
      if (byok.model) body.model = byok.model;
    }

    let res;
    try {
      res = await fetch(`${this.baseUrl}/api/generate-animation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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