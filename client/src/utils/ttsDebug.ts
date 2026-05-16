import type { TMessageContentParts } from 'librechat-data-provider';

/** Always uses `console.info` so traces show in production builds (the `logger` util is often disabled there). */

export function logTtsPayload(messageId: string | undefined, parts: TMessageContentParts[]) {
  console.info('[TTS payload]', {
    messageId,
    n: parts.length,
    partTypes: parts.map((p) => (p as { type?: string }).type).join(','),
  });
}

export function logTtsSpeak(
  messageId: string | undefined,
  messageContent: string | TMessageContentParts[],
  parsedMessage: string,
) {
  if (messageContent === '') {
    return;
  }
  if (Array.isArray(messageContent)) {
    console.info('[TTS speak]', {
      messageId,
      branch: 'parts',
      partTypes: messageContent.map((p) => (p as { type?: string }).type).join(','),
      inParts: messageContent.length,
      outChars: parsedMessage.length,
      preview: parsedMessage.slice(0, 220),
    });
  } else {
    console.info('[TTS speak]', {
      messageId,
      branch: 'string',
      outChars: parsedMessage.length,
      preview: parsedMessage.slice(0, 220),
    });
  }
}
