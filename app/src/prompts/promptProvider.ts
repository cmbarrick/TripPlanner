import { JournalPrompt, PromptContext, PromptProvider } from './types';
import { PRESET_PROMPTS } from './staticPrompts';

/** True when `prompt` applies to `ctx` (scope membership + event-type filter). */
export function promptMatches(prompt: JournalPrompt, ctx: PromptContext): boolean {
  if (!prompt.scopes.includes(ctx.scope)) return false;
  if (ctx.scope === 'Event' && prompt.eventTypes && prompt.eventTypes.length > 0) {
    return !!ctx.eventType && prompt.eventTypes.includes(ctx.eventType);
  }
  return true;
}

/**
 * Static prompt source: presets shipped in the app plus the traveler's custom prompts. Custom
 * prompts sort first so they're easy to find. Pure (no I/O) so it's trivial to unit-test and to
 * later swap for an AI-backed provider behind the same {@link PromptProvider} interface.
 */
export function createPromptProvider(customPrompts: JournalPrompt[] = []): PromptProvider {
  const all = [...customPrompts, ...PRESET_PROMPTS];
  const byId = new Map(all.map((p) => [p.id, p]));
  return {
    forContext(ctx) {
      return all.filter((p) => promptMatches(p, ctx));
    },
    byId(id) {
      return byId.get(id);
    },
  };
}
