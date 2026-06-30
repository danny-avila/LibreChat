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
 * Host + path alternation shared by the detection and strip regexes. Accepts any YouTube
 * subdomain (`www.`, `m.`, `music.`, ...) for youtube.com plus youtu.be and youtube-nocookie
 * embed links. The capture group is always the 11-char video id.
 */
const YOUTUBE_HOST_PATH =
  '(?:(?:[a-z0-9-]+\\.)*youtube\\.com\\/(?:watch\\?(?:\\S*?&)?v=|shorts\\/|live\\/|embed\\/|v\\/)' +
  '|(?:www\\.)?youtube-nocookie\\.com\\/embed\\/' +
  '|youtu\\.be\\/)';

/**
 * Matches YouTube watch/share/shorts/live/embed (incl. youtube-nocookie) URLs and captures the
 * 11-char video id. The leading lookbehind rejects hosts embedded in a longer domain (e.g.
 * `notyoutube.com`, `evil-youtube.com`); the trailing lookahead rejects ids inside a longer token.
 */
const YOUTUBE_URL_REGEX = new RegExp(
  `(?<![\\w.-])(?:https?:\\/\\/)?${YOUTUBE_HOST_PATH}([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])`,
  'gi',
);

/**
 * Like {@link YOUTUBE_URL_REGEX} but also captures the full trailing URL token (query/fragment),
 * so a matched link can be removed from the prompt text. Group 1 = video id, group 2 = trailing.
 */
const YOUTUBE_URL_STRIP_REGEX = new RegExp(
  `(?<![\\w.-])(?:https?:\\/\\/)?${YOUTUBE_HOST_PATH}([A-Za-z0-9_-]{11})(\\S*)`,
  'gi',
);

/** A YouTube link carries a user-selected moment (e.g. `?t=90`, `&start=90`, before or after `v=`). */
const YOUTUBE_TIMESTAMP_REGEX = /[?&](t|start)=/i;

/**
 * Removes from text only the YouTube URL tokens whose video id was injected as a video part and
 * that do not carry a timestamp. Over-limit links (not injected) and timestamped links are kept so
 * the model can still see/reason about them. Tidies leftover horizontal whitespace when changed.
 */
function stripYouTubeUrls(text: string, injectedIds: Set<string>): string {
  const replaced = text.replace(YOUTUBE_URL_STRIP_REGEX, (match, videoId) => {
    if (!injectedIds.has(videoId)) {
      return match;
    }
    /** Test the whole URL: the timestamp can precede `v=` (e.g. `watch?t=90&v=<id>`). */
    if (YOUTUBE_TIMESTAMP_REGEX.test(match)) {
      return match;
    }
    return '';
  });
  if (replaced === text) {
    return text;
  }
  return replaced
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

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

function stripYouTubeFromTextParts(
  parts: MessageContentComplex[],
  injectedIds: Set<string>,
): MessageContentComplex[] {
  const result: MessageContentComplex[] = [];
  for (const part of parts) {
    const record = part as Record<string, unknown>;
    if (record != null && record.type === ContentTypes.TEXT && typeof record.text === 'string') {
      const stripped = stripYouTubeUrls(record.text, injectedIds);
      if (stripped.length > 0) {
        result.push({ ...record, text: stripped } as MessageContentComplex);
      }
      continue;
    }
    result.push(part);
  }
  return result;
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
 * Appends YouTube video parts to a message's content when `url_context` is enabled, and removes
 * the matched YouTube URLs from the prompt text so the `urlContext` tool (which reads URLs from
 * the text and cannot fetch YouTube) does not spend its URL budget on them. Non-YouTube URLs are
 * left intact for the tool. No-ops when disabled, when no YouTube URLs are found, or when every
 * URL is already present as a media part. A string content is upgraded to a parts array only when
 * something is added.
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

  /** Only strip the links actually routed to video (capped + deduped set); over-limit links stay. */
  const injectedIds = new Set(
    urls.map((url) => new URL(url).searchParams.get('v')).filter((id): id is string => id != null),
  );
  return [...stripYouTubeFromTextParts(baseParts, injectedIds), ...newParts];
}
