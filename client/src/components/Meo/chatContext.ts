export type ChatContextMessage = { role: 'user' | 'assistant'; content: string };

/** Keep the recent turn sequence within the broker's 80-message / 40k-character limits. */
export function meoChatContext(messages: ChatContextMessage[]): ChatContextMessage[] {
  const selected: ChatContextMessage[] = [];
  let characters = 0;
  for (let index = messages.length - 1; index >= 0 && selected.length < 80; index -= 1) {
    const message = messages[index];
    const cost = message.content.length + 32;
    if (selected.length && characters + cost > 36000) break;
    selected.unshift(message);
    characters += cost;
  }
  return selected;
}
