import type { ChatGptMessage, ChatGptPart } from '~/import/types';

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_file'; fileId: string }
  | { type: 'audio'; fileId: string };

function pointerOf(part: ChatGptPart): string | null {
  if (typeof part === 'string') {
    return null;
  }
  if (part.content_type === 'real_time_user_audio_video_asset_pointer') {
    return part.audio_asset_pointer?.asset_pointer ?? null;
  }
  if (part.content_type === 'image_asset_pointer' || part.content_type === 'audio_asset_pointer') {
    return part.asset_pointer;
  }
  return null;
}

export function collectAssetPointers(message: ChatGptMessage): string[] {
  const parts = message.content.parts;
  if (!parts) {
    return [];
  }

  const pointers: string[] = [];
  for (const part of parts) {
    const pointer = pointerOf(part);
    if (pointer) {
      pointers.push(pointer);
    }
  }
  return pointers;
}

function convertPart(
  part: ChatGptPart,
  assets: Map<string, string>,
  parts: ContentPart[],
  texts: string[],
): void {
  if (typeof part === 'string') {
    if (part.length > 0) {
      parts.push({ type: 'text', text: part });
      texts.push(part);
    }
    return;
  }

  if (part.content_type === 'audio_transcription') {
    if (part.text.length > 0) {
      parts.push({ type: 'text', text: part.text });
      texts.push(part.text);
    }
    return;
  }

  const pointer = pointerOf(part);
  if (!pointer) {
    return;
  }

  const fileId = assets.get(pointer);
  if (!fileId) {
    return;
  }

  parts.push({
    type: part.content_type === 'image_asset_pointer' ? 'image_file' : 'audio',
    fileId,
  });
}

export function convertContent(
  message: ChatGptMessage,
  assets: Map<string, string>,
): { text: string; parts: ContentPart[] } {
  const { content } = message;

  if (content.content_type === 'code') {
    const text = `\`\`\`${content.language ?? ''}\n${content.text ?? ''}\n\`\`\``;
    return { text, parts: [{ type: 'text', text }] };
  }

  if (content.content_type === 'execution_output') {
    const text = `Execution Output:\n> ${content.text ?? ''}`;
    return { text, parts: [{ type: 'text', text }] };
  }

  if (!content.parts) {
    return { text: '', parts: [] };
  }

  const parts: ContentPart[] = [];
  const texts: string[] = [];
  for (const part of content.parts) {
    convertPart(part, assets, parts, texts);
  }

  return { text: texts.join('\n\n'), parts };
}
