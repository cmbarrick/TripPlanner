import { ItineraryItemType, NoteScope } from '../types';

/**
 * A reflection prompt the traveler can answer; the answer is saved as a `PromptResponse` note
 * (linked via `promptId`). Prompts live client-side — presets ship in the app, custom prompts are
 * stored locally — so the feature works fully offline. An AI-backed source can replace the provider
 * later (Phase 5/6) without changing storage, notifications, or the composer.
 */
export interface JournalPrompt {
  /** Stable id: a fixed UUID for presets, a generated one for custom prompts. */
  id: string;
  text: string;
  /** Which journal scopes this prompt suits (event/day/trip). */
  scopes: NoteScope[];
  /** For event-scoped prompts, restrict to these item types. Empty/undefined = any type. */
  eventTypes?: ItineraryItemType[];
  isCustom?: boolean;
}

/** The context a prompt is being surfaced in, used to pick relevant prompts. */
export interface PromptContext {
  scope: NoteScope;
  eventType?: ItineraryItemType | null;
}

/**
 * Seam over the prompt source. `StaticPromptProvider` (presets + local custom) backs it today; an
 * `AiPromptProvider` can be swapped in later with no changes to callers.
 */
export interface PromptProvider {
  /** Prompts applicable to a context (presets + custom), in display order. */
  forContext(ctx: PromptContext): JournalPrompt[];
  /** Look up a single prompt by id — used to render a saved response's question. */
  byId(id: string): JournalPrompt | undefined;
}
