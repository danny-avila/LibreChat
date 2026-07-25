import type { TextContentFragment } from '../types';

export interface ExternalMessagePart {
  readonly type?: string;
  readonly text?: string;
  readonly [key: string]: unknown;
}

export interface ExternalChatMessage {
  readonly role?: string;
  readonly content?: string | readonly (ExternalMessagePart | null | undefined)[];
}

function createMessageFragment(
  id: string,
  path: TextContentFragment['path'],
  text: string,
): TextContentFragment {
  return {
    id,
    path,
    text,
    source: 'message',
    format: 'plain',
    treatment: 'replaceable',
    provenance: 'user',
  };
}

export function* extractMessageContent(
  messages: readonly (ExternalChatMessage | null | undefined)[],
): Generator<TextContentFragment, void, undefined> {
  for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {
    const message = messages[messageIndex];
    if (message == null) {
      continue;
    }
    const content = message.content;
    if (typeof content === 'string') {
      yield createMessageFragment(
        `external-message.${messageIndex}.content`,
        `/${messageIndex}/content`,
        content,
      );
      continue;
    }
    if (!Array.isArray(content)) {
      continue;
    }
    for (let partIndex = 0; partIndex < content.length; partIndex++) {
      const part = content[partIndex];
      if (typeof part?.text !== 'string') {
        continue;
      }
      yield createMessageFragment(
        `external-message.${messageIndex}.part.${partIndex}`,
        `/${messageIndex}/content/${partIndex}/text`,
        part.text,
      );
    }
  }
}
