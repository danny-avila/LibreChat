import { Providers } from '@librechat/agents';
import { ContentTypes } from 'librechat-data-provider';
import type { MessageContentComplex } from '@librechat/agents';
import {
  hasUrlContextTool,
  extractYouTubeUrls,
  appendYouTubeVideoParts,
  DEFAULT_MAX_YOUTUBE_PARTS,
  resolveYouTubeInjectionConfig,
} from './youtube';

const WATCH = (id: string) => `https://www.youtube.com/watch?v=${id}`;

describe('extractYouTubeUrls', () => {
  it('extracts a standard watch URL', () => {
    expect(extractYouTubeUrls('Watch https://www.youtube.com/watch?v=dQw4w9WgXcQ now')).toEqual([
      WATCH('dQw4w9WgXcQ'),
    ]);
  });

  it('extracts youtu.be short links (with tracking params)', () => {
    expect(extractYouTubeUrls('see https://youtu.be/dQw4w9WgXcQ?si=abc123')).toEqual([
      WATCH('dQw4w9WgXcQ'),
    ]);
  });

  it('extracts shorts URLs', () => {
    expect(extractYouTubeUrls('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toEqual([
      WATCH('dQw4w9WgXcQ'),
    ]);
  });

  it('extracts live URLs', () => {
    expect(extractYouTubeUrls('https://www.youtube.com/live/dQw4w9WgXcQ')).toEqual([
      WATCH('dQw4w9WgXcQ'),
    ]);
  });

  it('extracts embed URLs', () => {
    expect(extractYouTubeUrls('https://www.youtube.com/embed/dQw4w9WgXcQ')).toEqual([
      WATCH('dQw4w9WgXcQ'),
    ]);
  });

  it('handles watch URLs with leading/trailing query params', () => {
    expect(
      extractYouTubeUrls('https://www.youtube.com/watch?list=PLxyz&v=dQw4w9WgXcQ&t=42'),
    ).toEqual([WATCH('dQw4w9WgXcQ')]);
  });

  it('handles m. and scheme-less hosts', () => {
    expect(extractYouTubeUrls('m.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual([WATCH('dQw4w9WgXcQ')]);
  });

  it('handles other YouTube subdomains (music., gaming.)', () => {
    expect(extractYouTubeUrls('https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual([
      WATCH('dQw4w9WgXcQ'),
    ]);
    expect(extractYouTubeUrls('https://gaming.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual([
      WATCH('dQw4w9WgXcQ'),
    ]);
  });

  it('handles youtube-nocookie embed URLs', () => {
    expect(extractYouTubeUrls('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')).toEqual([
      WATCH('dQw4w9WgXcQ'),
    ]);
  });

  it('preserves order across multiple distinct videos', () => {
    const text = 'https://youtu.be/aaaaaaaaaaa then https://www.youtube.com/watch?v=bbbbbbbbbbb';
    expect(extractYouTubeUrls(text)).toEqual([WATCH('aaaaaaaaaaa'), WATCH('bbbbbbbbbbb')]);
  });

  it('de-duplicates the same video id across different URL forms', () => {
    const text =
      'https://youtu.be/dQw4w9WgXcQ and https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10';
    expect(extractYouTubeUrls(text)).toEqual([WATCH('dQw4w9WgXcQ')]);
  });

  it('ignores non-YouTube URLs', () => {
    expect(extractYouTubeUrls('https://example.com/watch?v=dQw4w9WgXcQ')).toEqual([]);
  });

  it('ignores look-alike hosts (e.g. notyoutube.com, evil-youtube.com)', () => {
    expect(extractYouTubeUrls('https://notyoutube.com/watch?v=dQw4w9WgXcQ')).toEqual([]);
    expect(extractYouTubeUrls('https://evil-youtube.com/watch?v=dQw4w9WgXcQ')).toEqual([]);
    expect(extractYouTubeUrls('https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ')).toEqual([]);
  });

  it('ignores ids that are not exactly 11 valid characters', () => {
    expect(extractYouTubeUrls('https://www.youtube.com/watch?v=tooShort')).toEqual([]);
  });

  it('returns an empty array for empty / nullish input', () => {
    expect(extractYouTubeUrls('')).toEqual([]);
    expect(extractYouTubeUrls(undefined)).toEqual([]);
    expect(extractYouTubeUrls(null)).toEqual([]);
  });

  it('caps the number of returned URLs at the default', () => {
    const ids = Array.from(
      { length: DEFAULT_MAX_YOUTUBE_PARTS + 3 },
      (_, i) => `vid${String(i).padStart(8, '0')}`,
    );
    const text = ids.map((id) => `https://youtu.be/${id}`).join(' ');
    expect(extractYouTubeUrls(text)).toHaveLength(DEFAULT_MAX_YOUTUBE_PARTS);
  });

  it('honors a custom max', () => {
    const text = 'https://youtu.be/aaaaaaaaaaa https://youtu.be/bbbbbbbbbbb';
    expect(extractYouTubeUrls(text, 1)).toEqual([WATCH('aaaaaaaaaaa')]);
  });

  it('returns an empty array when max is zero', () => {
    expect(extractYouTubeUrls('https://youtu.be/dQw4w9WgXcQ', 0)).toEqual([]);
  });
});

describe('hasUrlContextTool', () => {
  it('returns true when a urlContext tool is present', () => {
    expect(hasUrlContextTool([{ urlContext: {} }])).toBe(true);
  });

  it('returns true when mixed with other provider tools', () => {
    expect(hasUrlContextTool([{ googleSearch: {} }, { urlContext: {} }])).toBe(true);
  });

  it('returns false when only other provider tools are present', () => {
    expect(hasUrlContextTool([{ googleSearch: {} }])).toBe(false);
  });

  it('returns false for empty / non-array inputs', () => {
    expect(hasUrlContextTool([])).toBe(false);
    expect(hasUrlContextTool(undefined)).toBe(false);
    expect(hasUrlContextTool(null)).toBe(false);
    expect(hasUrlContextTool('urlContext')).toBe(false);
  });
});

describe('appendYouTubeVideoParts', () => {
  const youtubeText = 'Summarize https://www.youtube.com/watch?v=dQw4w9WgXcQ for me';

  it('returns content unchanged when disabled', () => {
    const result = appendYouTubeVideoParts({
      enabled: false,
      text: youtubeText,
      content: youtubeText,
    });
    expect(result).toBe(youtubeText);
  });

  it('returns content unchanged when there are no YouTube URLs', () => {
    const text = 'Read https://example.com/article';
    const result = appendYouTubeVideoParts({ enabled: true, text, content: text });
    expect(result).toBe(text);
  });

  it('upgrades string content to a parts array, stripping the URL from text', () => {
    const result = appendYouTubeVideoParts({
      enabled: true,
      text: youtubeText,
      content: youtubeText,
    });

    expect(Array.isArray(result)).toBe(true);
    const parts = result as MessageContentComplex[];
    /** The YouTube URL is removed from the text since it now flows through video understanding. */
    expect(parts[0]).toEqual({ type: ContentTypes.TEXT, text: 'Summarize for me' });

    const mediaPart = parts[1] as Record<string, unknown>;
    expect(mediaPart.type).toBe('media');
    expect(mediaPart.fileUri).toBe(WATCH('dQw4w9WgXcQ'));
    /** The agents media converter requires the `mimeType` key to be present. */
    expect('mimeType' in mediaPart).toBe(true);
    expect(mediaPart.mimeType).toBeUndefined();
  });

  it('strips the YouTube URL from an existing text part but leaves other parts intact', () => {
    const content: MessageContentComplex[] = [
      { type: ContentTypes.TEXT, text: youtubeText } as MessageContentComplex,
      {
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,AAAA' },
      } as MessageContentComplex,
    ];
    const result = appendYouTubeVideoParts({
      enabled: true,
      text: youtubeText,
      content,
    }) as MessageContentComplex[];

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ type: ContentTypes.TEXT, text: 'Summarize for me' });
    expect(result[1]).toEqual(content[1]);
    expect((result[2] as Record<string, unknown>).fileUri).toBe(WATCH('dQw4w9WgXcQ'));
  });

  it('strips YouTube links from text but leaves non-YouTube URLs intact for urlContext', () => {
    const text = 'Watch https://youtu.be/dQw4w9WgXcQ and read https://example.com/article please';
    const result = appendYouTubeVideoParts({ enabled: true, text, content: text });

    const parts = result as MessageContentComplex[];
    const textPart = parts[0] as { type: string; text: string };
    expect(textPart.text).not.toContain('youtu.be');
    expect(textPart.text).not.toContain('dQw4w9WgXcQ');
    expect(textPart.text).toContain('https://example.com/article');
    expect(textPart.text).toBe('Watch and read https://example.com/article please');

    const mediaParts = parts.filter((p) => (p as Record<string, unknown>).type === 'media');
    expect(mediaParts).toHaveLength(1);
    expect((mediaParts[0] as Record<string, unknown>).fileUri).toBe(WATCH('dQw4w9WgXcQ'));
  });

  it('drops a text part that becomes empty after stripping a sole YouTube URL', () => {
    const text = 'https://youtu.be/dQw4w9WgXcQ';
    const result = appendYouTubeVideoParts({ enabled: true, text, content: text });

    const parts = result as MessageContentComplex[];
    expect(parts).toHaveLength(1);
    expect((parts[0] as Record<string, unknown>).type).toBe('media');
    expect((parts[0] as Record<string, unknown>).fileUri).toBe(WATCH('dQw4w9WgXcQ'));
  });

  it('keeps over-limit YouTube links in the text (only injected ones are stripped)', () => {
    const text = 'https://youtu.be/aaaaaaaaaaa and https://youtu.be/bbbbbbbbbbb';
    const result = appendYouTubeVideoParts({
      enabled: true,
      text,
      content: text,
      max: 1,
    }) as MessageContentComplex[];

    const mediaParts = result.filter((p) => (p as Record<string, unknown>).type === 'media');
    expect(mediaParts).toHaveLength(1);
    expect((mediaParts[0] as Record<string, unknown>).fileUri).toBe(WATCH('aaaaaaaaaaa'));

    const textPart = result.find((p) => (p as Record<string, unknown>).type === 'text') as {
      text: string;
    };
    /** The injected link is stripped; the over-limit link is preserved for the model. */
    expect(textPart.text).not.toContain('aaaaaaaaaaa');
    expect(textPart.text).toContain('bbbbbbbbbbb');
  });

  it('keeps a timestamped YouTube link in the text so the moment cue survives', () => {
    const text = 'what happens here https://youtu.be/dQw4w9WgXcQ?t=90';
    const result = appendYouTubeVideoParts({ enabled: true, text, content: text });

    const parts = result as MessageContentComplex[];
    const textPart = parts.find((p) => (p as Record<string, unknown>).type === 'text') as {
      text: string;
    };
    expect(textPart.text).toContain('t=90');

    const mediaParts = parts.filter((p) => (p as Record<string, unknown>).type === 'media');
    expect(mediaParts).toHaveLength(1);
    expect((mediaParts[0] as Record<string, unknown>).fileUri).toBe(WATCH('dQw4w9WgXcQ'));
  });

  it('keeps a timestamp that precedes the video id in the watch URL', () => {
    const text = 'jump to https://www.youtube.com/watch?t=90&v=dQw4w9WgXcQ';
    const result = appendYouTubeVideoParts({ enabled: true, text, content: text });

    const parts = result as MessageContentComplex[];
    const textPart = parts.find((p) => (p as Record<string, unknown>).type === 'text') as {
      text: string;
    };
    expect(textPart.text).toContain('t=90');
    expect(textPart.text).toContain('dQw4w9WgXcQ');

    const mediaParts = parts.filter((p) => (p as Record<string, unknown>).type === 'media');
    expect(mediaParts).toHaveLength(1);
  });

  it('does not duplicate a video already present as a media part', () => {
    const content: MessageContentComplex[] = [
      { type: ContentTypes.TEXT, text: youtubeText } as MessageContentComplex,
      {
        type: 'media',
        mimeType: undefined,
        fileUri: WATCH('dQw4w9WgXcQ'),
      } as MessageContentComplex,
    ];
    const result = appendYouTubeVideoParts({ enabled: true, text: youtubeText, content });
    expect(result).toBe(content);
  });

  it('de-duplicates against an existing fileData part', () => {
    const content: MessageContentComplex[] = [
      { type: ContentTypes.TEXT, text: youtubeText } as MessageContentComplex,
      {
        type: 'media',
        fileData: { fileUri: WATCH('dQw4w9WgXcQ') },
      } as unknown as MessageContentComplex,
    ];
    const result = appendYouTubeVideoParts({ enabled: true, text: youtubeText, content });
    expect(result).toBe(content);
  });

  it('stamps the provided mimeType on the media part (Vertex)', () => {
    const result = appendYouTubeVideoParts({
      enabled: true,
      text: youtubeText,
      content: youtubeText,
      mimeType: 'video/mp4',
    }) as MessageContentComplex[];

    const mediaPart = result[result.length - 1] as Record<string, unknown>;
    expect(mediaPart.type).toBe('media');
    expect(mediaPart.mimeType).toBe('video/mp4');
  });

  it('respects max=1 even when the message has multiple YouTube links', () => {
    const text = 'https://youtu.be/aaaaaaaaaaa and https://youtu.be/bbbbbbbbbbb';
    const result = appendYouTubeVideoParts({
      enabled: true,
      text,
      content: text,
      max: 1,
    }) as MessageContentComplex[];

    const mediaParts = result.filter((p) => (p as Record<string, unknown>).type === 'media');
    expect(mediaParts).toHaveLength(1);
    expect((mediaParts[0] as Record<string, unknown>).fileUri).toBe(WATCH('aaaaaaaaaaa'));
  });
});

describe('resolveYouTubeInjectionConfig', () => {
  it('caps Vertex at one video and sets a video/mp4 mimeType', () => {
    expect(
      resolveYouTubeInjectionConfig({ provider: Providers.VERTEXAI, model: 'gemini-2.5-flash' }),
    ).toEqual({
      max: 1,
      mimeType: 'video/mp4',
    });
  });

  it('allows multiple videos with no mimeType for Gemini 2.5+ on the Developer API', () => {
    expect(
      resolveYouTubeInjectionConfig({ provider: Providers.GOOGLE, model: 'gemini-2.5-flash' }),
    ).toEqual({
      max: DEFAULT_MAX_YOUTUBE_PARTS,
    });
    expect(
      resolveYouTubeInjectionConfig({ provider: Providers.GOOGLE, model: 'gemini-3-pro-preview' }),
    ).toEqual({
      max: DEFAULT_MAX_YOUTUBE_PARTS,
    });
  });

  it('caps pre-2.5 and unknown Developer API models at one video', () => {
    expect(
      resolveYouTubeInjectionConfig({ provider: Providers.GOOGLE, model: 'gemini-2.0-flash' }),
    ).toEqual({
      max: 1,
    });
    expect(
      resolveYouTubeInjectionConfig({ provider: Providers.GOOGLE, model: 'gemini-1.5-pro' }),
    ).toEqual({
      max: 1,
    });
    expect(resolveYouTubeInjectionConfig({ provider: Providers.GOOGLE })).toEqual({ max: 1 });
  });
});
