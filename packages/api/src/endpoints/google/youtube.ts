import { Providers } from '@librechat/agents';
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

/** Per-message cap on auto-injected YouTube video parts for Gemini 2.5+ (the API allows up to 10). */
export const DEFAULT_MAX_YOUTUBE_PARTS = 5;

/** A Gemini video-understanding content block (becomes a `fileData` part downstream). */
export interface YouTubeVideoPart {
  type: 'media';
  /**
   * Always present as a key so the agents `messageContentMedia` `'mimeType' in content` guard
   * passes. The Gemini Developer API omits it for YouTube (value `undefined`, dropped on JSON
   * serialization); Vertex samples set `video/mp4`.
   */
  mimeType?: string;
  fileUri: string;
}

const GEMINI_VERSION_REGEX = /gemini-(\d+)(?:\.(\d+))?/i;

/** Gemini 2.5+ models accept up to 10 YouTube videos per request; earlier models accept 1. */
function isGemini25OrLater(model?: string): boolean {
  if (typeof model !== 'string') {
    return false;
  }
  const match = GEMINI_VERSION_REGEX.exec(model);
  if (!match) {
    return false;
  }
  const major = Number(match[1]);
  const minor = Number(match[2] ?? '0');
  return major > 2 || (major === 2 && minor >= 5);
}

/**
 * Resolves provider/model-aware YouTube injection limits.
 * - Vertex: every Vertex sample sets a `video/mp4` mimeType on YouTube fileData, and Vertex is
 *   capped conservatively at a single YouTube URL per request.
 * - Gemini Developer API: omits the mimeType; 2.5+ models accept multiple videos, earlier ones one.
 */
export function resolveYouTubeInjectionConfig(params: { provider?: string; model?: string }): {
  max: number;
  mimeType?: string;
} {
  if (params.provider === Providers.VERTEXAI) {
    return { max: 1, mimeType: 'video/mp4' };
  }
  return { max: isGemini25OrLater(params.model) ? DEFAULT_MAX_YOUTUBE_PARTS : 1 };
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
  mimeType?: string;
}): string | MessageContentComplex[] {
  const { enabled, text, content, max, mimeType } = params;
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
    .map((fileUri) => ({ type: 'media', mimeType, fileUri }) as MessageContentComplex);

  if (newParts.length === 0) {
    return content;
  }
  return [...baseParts, ...newParts];
}
