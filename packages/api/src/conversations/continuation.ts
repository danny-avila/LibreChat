import { Constants } from 'librechat-data-provider';
import type { FiltersConfig, MessageFilterPiiConfig } from 'librechat-data-provider';
import type { ConversationResourceMethods } from '@librechat/data-schemas';
import {
  CONTENT_MATERIALIZATION_MAX_CHARACTERS,
  CONTENT_TRAVERSAL_MAX_NODES,
} from '~/protection/adapters/nested';
import { assertModelBoundContent } from '~/middleware/modelBoundContent';
import { projectConversationMessage } from './schema';

interface ImportedAssistantPromptInput {
  userId: string;
  tenantId?: string;
  conversationId: string;
  parentMessageId: string;
  endpoint: string;
  text?: string;
  config?: { filters?: FiltersConfig; messageFilter?: { pii?: MessageFilterPiiConfig } };
}

/** Replays an owned imported branch as text; source provider resources never become live bindings. */
export async function buildImportedAssistantPrompt(
  input: ImportedAssistantPromptInput,
  deps: Pick<ConversationResourceMethods, 'getImportedAssistantMessages'>,
): Promise<string> {
  const text = input.text ?? '';
  const messages = await deps.getImportedAssistantMessages(
    input.userId,
    input.tenantId,
    input.conversationId,
    input.endpoint,
  );
  const invalid = () => new Error('Missing thread_id for existing conversation');
  if (messages == null || messages.length > CONTENT_TRAVERSAL_MAX_NODES) throw invalid();
  if (messages.length === 0 && input.parentMessageId === Constants.NO_PARENT) return text;
  const byId = new Map(messages.map((message) => [message.messageId, message]));
  if (byId.size !== messages.length) throw invalid();
  const seen = new Set<string>();
  const history: string[] = [];
  let id = input.parentMessageId;
  let characters = text.length;
  while (id !== Constants.NO_PARENT) {
    const message = byId.get(id);
    if (!message || seen.has(id) || message.isUserSubmitted !== true || message.thread_id)
      throw invalid();
    seen.add(id);
    const projected = projectConversationMessage(message);
    const entry = JSON.stringify({
      role: message.isCreatedByUser ? 'user' : 'assistant',
      text: projected.text,
      content: projected.content,
    });
    characters += entry.length;
    if (characters > CONTENT_MATERIALIZATION_MAX_CHARACTERS) throw invalid();
    history.push(entry);
    id = message.parentMessageId ?? Constants.NO_PARENT;
  }
  if (history.length === 0) throw invalid();
  const prompt = `Imported conversation transcript:\n${history.reverse().join('\n')}\n\nCurrent message:\n${text}`;
  assertModelBoundContent({
    filters: input.config?.filters,
    legacyPii: input.config?.messageFilter?.pii,
    submittedMessages: [
      { role: 'user', content: prompt },
      { role: 'user', content: [{ type: 'text', text: prompt }] },
    ],
  });
  return prompt;
}
