import { AiChatStreamEvent } from '../api';

/** Parses SSE blocks from a response body (works with streaming or buffered text). */
export function parseSseEvents(buffer: string, onEvent: (event: AiChatStreamEvent) => void): string {
  const parts = buffer.split('\n\n');
  const remainder = parts.pop() ?? '';

  for (const part of parts) {
    if (!part.trim()) continue;
    let eventType = 'message';
    let dataLine = '';
    for (const line of part.split('\n')) {
      if (line.startsWith('event:')) eventType = line.slice(6).trim();
      if (line.startsWith('data:')) dataLine += line.slice(5).trim();
    }
    if (!dataLine) continue;
    try {
      const payload = JSON.parse(dataLine) as AiChatStreamEvent;
      onEvent({ ...payload, type: payload.type ?? eventType });
    } catch {
      /* ignore malformed chunks */
    }
  }

  return remainder;
}

export async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: AiChatStreamEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = parseSseEvents(buffer, onEvent);
  }

  if (buffer.trim()) parseSseEvents(`${buffer}\n\n`, onEvent);
}
