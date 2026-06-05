import { JournalPrompt } from './types';

// Preset reflection prompts. Ids are fixed UUIDs so saved responses keep resolving to their
// question across app versions — never reuse or change an id once shipped. Keep the wording warm,
// short, and answerable in a sentence. Event prompts can target specific item types; day/trip
// prompts are type-agnostic.
export const PRESET_PROMPTS: JournalPrompt[] = [
  // ── Any event ──────────────────────────────────────────────────────────────
  { id: '8a1f6e2c-0001-4a10-9f01-0000000000a1', text: 'What stood out about this?', scopes: ['Event'] },
  { id: '8a1f6e2c-0002-4a10-9f01-0000000000a2', text: 'How are you feeling right now?', scopes: ['Event'] },
  { id: '8a1f6e2c-0003-4a10-9f01-0000000000a3', text: 'What would you tell a friend about this moment?', scopes: ['Event'] },
  // ── Food ───────────────────────────────────────────────────────────────────
  { id: '8a1f6e2c-0010-4a10-9f01-0000000000b1', text: 'What did you order, and was it worth it?', scopes: ['Event'], eventTypes: ['Food'] },
  { id: '8a1f6e2c-0011-4a10-9f01-0000000000b2', text: 'Would you come back here? Why?', scopes: ['Event'], eventTypes: ['Food'] },
  // ── Activity ─────────────────────────────────────────────────────────────────
  { id: '8a1f6e2c-0020-4a10-9f01-0000000000c1', text: 'What surprised you here?', scopes: ['Event'], eventTypes: ['Activity'] },
  { id: '8a1f6e2c-0021-4a10-9f01-0000000000c2', text: 'What is one detail you want to remember?', scopes: ['Event'], eventTypes: ['Activity'] },
  // ── Lodging ──────────────────────────────────────────────────────────────────
  { id: '8a1f6e2c-0030-4a10-9f01-0000000000d1', text: 'How was the stay — comfortable, well-located, would you book again?', scopes: ['Event'], eventTypes: ['Lodging'] },
  // ── Flight / Transport ───────────────────────────────────────────────────────
  { id: '8a1f6e2c-0040-4a10-9f01-0000000000e1', text: 'How did the journey go?', scopes: ['Event'], eventTypes: ['Flight', 'Transport'] },
  // ── Day ──────────────────────────────────────────────────────────────────────
  { id: '8a1f6e2c-0050-4a10-9f01-0000000000f1', text: 'What was the highlight of your day?', scopes: ['Day'] },
  { id: '8a1f6e2c-0051-4a10-9f01-0000000000f2', text: 'What would you do differently tomorrow?', scopes: ['Day'] },
  { id: '8a1f6e2c-0052-4a10-9f01-0000000000f3', text: 'Who or what made you smile today?', scopes: ['Day'] },
  // ── Trip ───────────────────────────────────────────────────────────────────
  { id: '8a1f6e2c-0060-4a10-9f01-000000000101', text: 'What is your favorite memory from this trip so far?', scopes: ['Trip'] },
  { id: '8a1f6e2c-0061-4a10-9f01-000000000102', text: 'What did this place teach you?', scopes: ['Trip'] },
  // ── Day + Trip (general reflection) ──────────────────────────────────────────
  { id: '8a1f6e2c-0070-4a10-9f01-000000000201', text: 'What are you grateful for right now?', scopes: ['Day', 'Trip'] },
];
