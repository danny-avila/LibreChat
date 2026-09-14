import { isAIMessage } from '@langchain/core/messages';
import { inspectProviderMessageProvenance } from '@librechat/agents';
import type { BaseMessage } from '@langchain/core/messages';

/** Only host-attributed human requests establish authority. Source indices refer to
 * persisted content, not this formatted message, so mixed authorship cannot be sliced safely. */
type ReviewerEntry =
  | { role: 'human'; sourceMessageIds: string[]; content: string }
  | { role: 'tool_call'; actor: 'model'; id?: string; tool: string; arguments: unknown };

export function buildReviewerTranscript(messages: readonly BaseMessage[]): ReviewerEntry[] {
  const transcript: ReviewerEntry[] = [];
  for (const message of messages) {
    if (message.getType() === 'human') {
      const state = inspectProviderMessageProvenance(message);
      if (state.status !== 'valid') throw new Error('Missing user attribution');
      const parts = state.provenance.parts;
      if (!parts.some((part) => part.attribution === 'user')) continue;
      if (parts.some((part) => part.attribution !== 'user' || !part.sourceMessageId)) {
        throw new Error('Ambiguous user attribution');
      }
      let content: string;
      if (typeof message.content === 'string') content = message.content;
      else {
        // Omitting an image or other non-text constraint could change the authorization.
        if (
          message.content.some(
            (part) =>
              typeof part !== 'object' || part.type !== 'text' || typeof part.text !== 'string',
          )
        ) {
          throw new Error('Unsupported user evidence');
        }
        content = message.content.map((part) => (part as { text: string }).text).join('\n');
      }
      transcript.push({
        role: 'human',
        sourceMessageIds: [...new Set(parts.map((part) => part.sourceMessageId!))],
        content,
      });
    } else if (isAIMessage(message)) {
      if (message.invalid_tool_calls?.length) throw new Error('Incomplete tool history');
      for (const call of message.tool_calls ?? []) {
        transcript.push({
          role: 'tool_call',
          actor: 'model',
          id: call.id,
          tool: call.name,
          arguments: call.args,
        });
      }
    }
  }
  const seen = new Set<string>();
  return transcript.filter((entry) => {
    if (entry.role === 'tool_call' && !entry.id) return true;
    const key = JSON.stringify(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Keep the run's original user constraints even if the live graph compacts history. */
export function reviewerRunMessages(
  initial: readonly BaseMessage[],
  current?: readonly BaseMessage[],
): readonly BaseMessage[] {
  return current == null ? initial : [...initial, ...current];
}
