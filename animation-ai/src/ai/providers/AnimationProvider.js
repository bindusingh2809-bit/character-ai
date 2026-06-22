/**
 * AnimationProvider interface (documented in JS since this project is JS,
 * not TS — see animationModels.js for the runtime-validated shape).
 *
 *   interface AnimationProvider {
 *     generate(prompt: string): Promise<AnimationPlan>
 *   }
 *
 * Business code (the AI Animation panel) must depend only on this
 * interface, never on a specific provider's implementation details.
 */
export class AnimationProvider {
  // eslint-disable-next-line no-unused-vars
  async generate(prompt) {
    throw new Error('AnimationProvider.generate() not implemented');
  }
}
