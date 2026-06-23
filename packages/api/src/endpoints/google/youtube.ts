import { ContentTypes } from 'librechat-data-provider';
import type { MessageContentComplex } from '@librechat/agents';

/**
 * Native YouTube -> Gemini video-understanding support for the Google `url_context` param.
 *
 * The Gemini URL Context tool does NOT support YouTube as a content type; YouTube must be
 * passed as a video part (`fileData.fileUri`) via the video-understanding path. When
 * `url_context` is enabled we detect YouTube URLs in the user's message and inject them as
 * `{ type: 'media', fileUri }` content blocks, which the `@librechat/agents` Google content
 * formatter converts into `fileData` parts. All other URLs keep flowing through the native
 * `urlContext` tool.
 */

/** Default cap on auto-injected YouTube video parts per message (Gemini practical limits). */
export const DEFAULT_MAX_YOUTUBE_PARTS = 5;

/** A Gemini video-understanding content block (becomes a `fileData` part downstream). */
export interface YouTubeVideoPart {
  type: 'media';
  /**
   * Present (even as `undefined`) so the agents `messageContentMedia` `'mimeType' in content`
   * guard passes; YouTube does not require a mimeType and an undefined value is dropped on
   * JSON serialization of the request.
   */
  mimeType?: string;
  fileUri: string;
}

/**
 * Matches YouTube watch/share/shorts/live/embed URLs and captures the 11-char video id.
 * Any YouTube subdomain is accepted (`www.`, `m.`, `music.`, `gaming.`, ...). The leading
 * lookbehind rejects hosts embedded in a longer domain (e.g. `notyoutube.com`,
 * `evil-youtube.com`) and the trailing lookahead rejects ids that are part of a longer token.
 */
const YOUTUBE_URL_REGEX = new RegExp(
  '(?<![\\w.-])(?:https?:\\/\\/)?' +
    '(?:(?:[a-z0-9-]+\\.)*youtube\\.com\\/(?:watch\\?(?:\\S*?&)?v=|shorts\\/|live\\/|embed\\/|v\\/)|youtu\\.be\\/)' +
    '([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])',
  'gi',
);

function resolveLimit(max?: number): number {
  if (max == null || !Number.isFinite(max)) {
    return DEFAULT_MAX_YOUTUBE_PARTS;
  }
  return Math.max(0, Math.floor(max));
}

/**
 * Extracts YouTube URLs from text, normalized to canonical `watch?v=<id>` form, de-duplicated
 * by video id (first occurrence wins), and capped at `max` (default {@link DEFAULT_MAX_YOUTUBE_PARTS}).
 */
export function extractYouTubeUrls(text?: string | null, max?: number): string[] {
  const limit = resolveLimit(max);
  if (limit === 0 || typeof text !== 'string' || text.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const urls: string[] = [];
  YOUTUBE_URL_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = YOUTUBE_URL_REGEX.exec(text)) !== null) {
    const videoId = match[1];
    if (seen.has(videoId)) {
      continue;
    }
    seen.add(videoId);
    urls.push(`https://www.youtube.com/watch?v=${videoId}`);
    if (urls.length >= limit) {
      break;
    }
  }
  return urls;
}

/** True when the resolved provider tool list contains the native Google `urlContext` tool. */
export function hasUrlContextTool(tools: unknown): boolean {
  if (!Array.isArray(tools)) {
    return false;
  }
  return tools.some((tool) => tool != null && typeof tool === 'object' && 'urlContext' in tool);
}

function toBaseParts(content: string | MessageContentComplex[]): MessageContentComplex[] {
  if (Array.isArray(content)) {
    return content;
  }
  if (typeof content === 'string' && content.length > 0) {
    return [{ type: ContentTypes.TEXT, text: content } as MessageContentComplex];
  }
  return [];
}

function collectFileUris(parts: MessageContentComplex[]): Set<string> {
  const uris = new Set<string>();
  for (const part of parts) {
    if (part == null || typeof part !== 'object') {
      continue;
    }
    const record = part as Record<string, unknown>;
    if (typeof record.fileUri === 'string') {
      uris.add(record.fileUri);
    }
    const fileData = record.fileData as { fileUri?: unknown } | undefined;
    if (fileData != null && typeof fileData.fileUri === 'string') {
      uris.add(fileData.fileUri);
    }
  }
  return uris;
}

/**
 * Appends YouTube video parts to a message's content when `url_context` is enabled.
 * No-ops when disabled, when no YouTube URLs are found, or when every URL is already present
 * as a media part. A string content is upgraded to a parts array only when something is added.
 */
export function appendYouTubeVideoParts(params: {
  enabled: boolean;
  text?: string | null;
  content: string | MessageContentComplex[];
  max?: number;
}): string | MessageContentComplex[] {
  const { enabled, text, content, max } = params;
  if (!enabled) {
    return content;
  }

  const urls = extractYouTubeUrls(text, max);
  if (urls.length === 0) {
    return content;
  }

  const baseParts = toBaseParts(content);
  const existing = collectFileUris(baseParts);
  const newParts = urls
    .filter((url) => !existing.has(url))
    .map((fileUri) => ({ type: 'media', mimeType: undefined, fileUri }) as MessageContentComplex);

  if (newParts.length === 0) {
    return content;
  }
  return [...baseParts, ...newParts];
}
