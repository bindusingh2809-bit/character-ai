import { AnimationProvider } from './AnimationProvider';
import { SUPPORTED_ACTIONS } from '../motions/motionLibrary';

// Keyword → action name, checked in order (first match per segment wins).
const KEYWORD_MAP = [
  [/\bjump(s|ing)?\b/i, 'jump'],
  [/\bwave(s|ing)?\b/i, 'wave'],
  [/\bpoint(s|ing)?\b/i, 'point'],
  [/\bclap(s|ping)?\b/i, 'clap'],
  [/\bdanc(e|es|ing)\b/i, 'dance'],
  [/\bcelebrat(e|es|ing)\b/i, 'celebrate'],
  [/\bsit(s|ting)?\b|\bsit down\b/i, 'sit'],
  [/\blook(s|ing)? left\b/i, 'look_left'],
  [/\blook(s|ing)? right\b/i, 'look_right'],
  [/\bnod(s|ding)?\b/i, 'nod'],
  [/\bshake(s)? (his|her|their|the)? ?head\b/i, 'shake_head'],
  [/\brun(s|ning)?\b/i, 'run'],
  [/\bwalk(s|ing)?\b/i, 'walk'],
  [/\bidle\b|\bstand(s|ing)?\b|\bstop(s|ping)?\b/i, 'idle'],
];

function extractSide(segment) {
  if (/\bleft\b/i.test(segment)) return 'left';
  if (/\bright\b/i.test(segment)) return 'right';
  return undefined;
}

function extractCount(segment) {
  const words = { twice: 2, two: 2, three: 3, thrice: 3, four: 4 };
  const wordMatch = segment.match(/\b(twice|two|three|thrice|four)\b/i);
  if (wordMatch) return words[wordMatch[1].toLowerCase()];
  const numMatch = segment.match(/\b(\d+)\s*times?\b/i);
  if (numMatch) return parseInt(numMatch[1], 10);
  return undefined;
}

/**
 * MockAnimationProvider — deterministic, local, no network calls.
 * Splits the prompt on commas/"then"/"and" into segments and maps each
 * segment to the first matching supported action. Useful for development,
 * tests, and as a graceful fallback when no backend/API key is configured.
 */
export class MockAnimationProvider extends AnimationProvider {
  async generate(prompt) {
    const segments = String(prompt)
      .split(/,|\bthen\b|\band\b/i)
      .map(s => s.trim())
      .filter(Boolean);

    const actions = [];
    for (const segment of segments) {
      const found = KEYWORD_MAP.find(([re]) => re.test(segment));
      if (!found) continue;
      const name = found[1];
      if (!SUPPORTED_ACTIONS.includes(name)) continue;

      const action = { name };
      const side = extractSide(segment);
      if (side) action.side = side;
      const count = extractCount(segment);
      if (count) action.count = count;
      actions.push(action);
    }

    if (actions.length === 0) {
      // Last-resort fallback so the UI always has something to preview.
      actions.push({ name: 'idle' });
    }

    return { actions };
  }
}
