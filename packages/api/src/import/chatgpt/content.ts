import type { ChatGptMessage, ChatGptPart, ImportedAsset } from '~/import/types';

export type ContentPart = { type: 'text'; text: string };

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
  assets: Map<string, ImportedAsset>,
  parts: ContentPart[],
  texts: string[],
  files: ImportedAsset[],
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

  const asset = assets.get(pointer);
  if (!asset) {
    return;
  }

  files.push(asset);
}

export function convertContent(
  message: ChatGptMessage,
  assets: Map<string, ImportedAsset>,
): { text: string; parts: ContentPart[]; files: ImportedAsset[] } {
  const { content } = message;

  if (content.content_type === 'code') {
    const text = `\`\`\`${content.language ?? ''}\n${content.text ?? ''}\n\`\`\``;
    return { text, parts: [{ type: 'text', text }], files: [] };
  }

  if (content.content_type === 'execution_output') {
    const text = `Execution Output:\n> ${content.text ?? ''}`;
    return { text, parts: [{ type: 'text', text }], files: [] };
  }

  if (!content.parts) {
    return { text: '', parts: [], files: [] };
  }

  const parts: ContentPart[] = [];
  const texts: string[] = [];
  const files: ImportedAsset[] = [];
  for (const part of content.parts) {
    convertPart(part, assets, parts, texts, files);
  }

  return { text: texts.join('\n\n'), parts, files };
}
