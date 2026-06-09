import { parseSseEvents } from './chatStream';

describe('parseSseEvents', () => {
  it('parses text_delta events', () => {
    const events: unknown[] = [];
    parseSseEvents('event: text_delta\ndata: {"type":"text_delta","text":"Hi"}\n\n', (e) => events.push(e));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'text_delta', text: 'Hi' });
  });
});
