import { useUiStore } from './uiStore';

describe('uiStore — AI dock handoff', () => {
  beforeEach(() => {
    useUiStore.setState({
      tab: 'trips',
      tripView: 'detail',
      openTripId: 'trip-1',
      pendingAiPrompt: null,
    });
  });

  it('openAssistant switches to the assistant tab and stores the prompt', () => {
    useUiStore.getState().openAssistant('Add a beach day');
    const s = useUiStore.getState();
    expect(s.tab).toBe('assistant');
    expect(s.pendingAiPrompt).toBe('Add a beach day');
  });

  it('openAssistant keeps the open trip pinned for the assistant', () => {
    useUiStore.getState().openAssistant('Tweak day 2');
    expect(useUiStore.getState().openTripId).toBe('trip-1');
  });

  it('openAssistant with no/blank prompt opens chat without a pending prompt', () => {
    useUiStore.getState().openAssistant();
    expect(useUiStore.getState().tab).toBe('assistant');
    expect(useUiStore.getState().pendingAiPrompt).toBeNull();

    useUiStore.getState().openAssistant('   ');
    expect(useUiStore.getState().pendingAiPrompt).toBeNull();
  });

  it('clearPendingAiPrompt empties the handoff', () => {
    useUiStore.getState().openAssistant('Add a museum');
    useUiStore.getState().clearPendingAiPrompt();
    expect(useUiStore.getState().pendingAiPrompt).toBeNull();
  });

  it('setTab to assistant keeps planner state so the trip stays pinned', () => {
    useUiStore.getState().setTab('assistant');
    expect(useUiStore.getState().openTripId).toBe('trip-1');
  });
});
