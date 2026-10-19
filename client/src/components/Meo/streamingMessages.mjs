// Keep the costly Markdown DOM bounded while retaining every loaded message
// in memory for the existing conversation/export behavior.
export function visibleTranscript(total, count = 48) {
  const size = Math.max(0, Math.trunc(Number.isFinite(total) ? total : 0));
  const allowed = Math.max(1, Math.trunc(Number.isFinite(count) ? count : 48));
  return Math.max(0, size - allowed);
}

// Preserve earlier React.memo identities and replace only the assistant tail.
export function appendAssistantChunk(messages, chunk) {
  if (!Array.isArray(messages) || !chunk) return messages;
  const last = messages.at(-1);
  if (!last || last.role !== 'assistant') return messages;
  return [...messages.slice(0,-1), {...last, content:last.content+chunk}];
}
