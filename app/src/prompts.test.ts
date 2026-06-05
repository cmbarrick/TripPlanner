import { createPromptProvider, promptMatches } from './prompts/promptProvider';
import { promptsEnabledForTrip, PromptSettings } from './prompts/store';
import { PRESET_PROMPTS } from './prompts/staticPrompts';
import { JournalPrompt } from './prompts/types';

describe('promptMatches', () => {
  const foodPrompt: JournalPrompt = { id: 'f', text: 'food?', scopes: ['Event'], eventTypes: ['Food'] };
  const anyEvent: JournalPrompt = { id: 'e', text: 'any?', scopes: ['Event'] };
  const dayPrompt: JournalPrompt = { id: 'd', text: 'day?', scopes: ['Day', 'Trip'] };

  it('requires the scope to match', () => {
    expect(promptMatches(anyEvent, { scope: 'Event' })).toBe(true);
    expect(promptMatches(anyEvent, { scope: 'Day' })).toBe(false);
    expect(promptMatches(dayPrompt, { scope: 'Day' })).toBe(true);
    expect(promptMatches(dayPrompt, { scope: 'Trip' })).toBe(true);
  });

  it('applies the event-type filter only for event scope', () => {
    expect(promptMatches(foodPrompt, { scope: 'Event', eventType: 'Food' })).toBe(true);
    expect(promptMatches(foodPrompt, { scope: 'Event', eventType: 'Activity' })).toBe(false);
    expect(promptMatches(foodPrompt, { scope: 'Event' })).toBe(false);
    // No event-type restriction → matches any event.
    expect(promptMatches(anyEvent, { scope: 'Event', eventType: 'Lodging' })).toBe(true);
  });
});

describe('createPromptProvider', () => {
  it('returns generic + type-matching presets for an event', () => {
    const provider = createPromptProvider();
    const forFood = provider.forContext({ scope: 'Event', eventType: 'Food' });
    // Generic event prompts (no eventTypes) are included.
    expect(forFood.some((p) => p.text === 'What stood out about this?')).toBe(true);
    // Food-specific prompt is included.
    expect(forFood.some((p) => p.eventTypes?.includes('Food'))).toBe(true);
    // Activity-only prompt is excluded.
    expect(forFood.some((p) => p.eventTypes?.includes('Activity') && !p.eventTypes?.includes('Food'))).toBe(false);
  });

  it('sorts custom prompts ahead of presets and resolves them by id', () => {
    const custom: JournalPrompt = { id: 'c1', text: 'mine', scopes: ['Event', 'Day', 'Trip'], isCustom: true };
    const provider = createPromptProvider([custom]);
    const list = provider.forContext({ scope: 'Trip' });
    expect(list[0].id).toBe('c1');
    expect(provider.byId('c1')).toEqual(custom);
    expect(provider.byId(PRESET_PROMPTS[0].id)?.text).toBe(PRESET_PROMPTS[0].text);
    expect(provider.byId('does-not-exist')).toBeUndefined();
  });
});

describe('promptsEnabledForTrip', () => {
  const base: PromptSettings = { enabledGlobal: true, disabledTripIds: [], custom: [] };

  it('is on when global is on and the trip is not disabled', () => {
    expect(promptsEnabledForTrip(base, 'trip-1')).toBe(true);
  });

  it('is off when globally disabled', () => {
    expect(promptsEnabledForTrip({ ...base, enabledGlobal: false }, 'trip-1')).toBe(false);
  });

  it('is off when the specific trip is disabled', () => {
    expect(promptsEnabledForTrip({ ...base, disabledTripIds: ['trip-1'] }, 'trip-1')).toBe(false);
    expect(promptsEnabledForTrip({ ...base, disabledTripIds: ['trip-1'] }, 'trip-2')).toBe(true);
  });
});
