import type { ChatGptMessage, ImportedAsset } from '~/import/types';
import { collectAssetPointers, convertContent } from './content';

function message(content: ChatGptMessage['content']): ChatGptMessage {
  return {
    id: 'm1',
    author: { role: 'user', name: null },
    create_time: 1,
    content,
  };
}

function asset(id: string, type = 'image/png'): ImportedAsset {
  return {
    file_id: id,
    filepath: `/assets/${id}`,
    filename: `${id}.png`,
    type,
  };
}

describe('convertContent', () => {
  it('joins text parts without inserting separators', () => {
    const result = convertContent(
      message({ content_type: 'text', parts: ['Hello world'] }),
      new Map(),
    );
    expect(result.text).toBe('Hello world');
  });

  it('joins multiple text fragments with blank line separator', () => {
    const result = convertContent(
      message({ content_type: 'text', parts: ['Hello', 'world', 'test'] }),
      new Map(),
    );
    expect(result.text).toBe('Hello\n\nworld\n\ntest');
  });

  it('keeps every object part instead of only the last', () => {
    const assets = new Map([
      ['file-service://file-A', asset('lc-a')],
      ['file-service://file-B', asset('lc-b')],
    ]);
    const result = convertContent(
      message({
        content_type: 'multimodal_text',
        parts: [
          { content_type: 'image_asset_pointer', asset_pointer: 'file-service://file-A' },
          { content_type: 'image_asset_pointer', asset_pointer: 'file-service://file-B' },
          'compare these',
        ],
      }),
      assets,
    );
    expect(result.parts).toEqual([{ type: 'text', text: 'compare these' }]);
    expect(result.files).toEqual([asset('lc-a'), asset('lc-b')]);
    expect(result.text).toBe('compare these');
  });

  it('handles OOS shape: two image objects followed by text', () => {
    const assets = new Map([
      ['file-service://img-1', asset('img-1')],
      ['file-service://img-2', asset('img-2')],
    ]);
    const result = convertContent(
      message({
        content_type: 'multimodal_text',
        parts: [
          { content_type: 'image_asset_pointer', asset_pointer: 'file-service://img-1' },
          { content_type: 'image_asset_pointer', asset_pointer: 'file-service://img-2' },
          'describe the images',
        ],
      }),
      assets,
    );
    expect(result.files).toHaveLength(2);
    expect(result.files[0]).toEqual(asset('img-1'));
    expect(result.files[1]).toEqual(asset('img-2'));
    expect(result.text).toBe('describe the images');
  });

  it('renders voice transcripts as text and attaches the audio', () => {
    const audioAsset = { ...asset('lc-audio'), type: 'audio/mpeg' };
    const assets = new Map([['sediment://file_1', audioAsset]]);
    const result = convertContent(
      message({
        content_type: 'multimodal_text',
        parts: [
          { content_type: 'audio_transcription', text: 'Allora iniziamo', direction: 'out' },
          { content_type: 'audio_asset_pointer', asset_pointer: 'sediment://file_1' },
        ],
      }),
      assets,
    );
    expect(result.text).toBe('Allora iniziamo');
    expect(result.parts).toEqual([{ type: 'text', text: 'Allora iniziamo' }]);
    expect(result.files).toEqual([audioAsset]);
  });

  it('skips pointers with no imported asset rather than dumping JSON', () => {
    const result = convertContent(
      message({
        content_type: 'multimodal_text',
        parts: [
          { content_type: 'image_asset_pointer', asset_pointer: 'file-service://gone' },
          'describe it',
        ],
      }),
      new Map(),
    );
    expect(result.parts).toEqual([{ type: 'text', text: 'describe it' }]);
    expect(result.files).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('asset_pointer');
  });

  it('still handles legacy code and execution_output blocks', () => {
    expect(
      convertContent(
        message({ content_type: 'code', language: 'python', text: 'print(1)' }),
        new Map(),
      ).text,
    ).toBe('```python\nprint(1)\n```');

    expect(
      convertContent(message({ content_type: 'execution_output', text: '1' }), new Map()).text,
    ).toBe('Execution Output:\n> 1');
  });

  it('drops empty transcript parts', () => {
    const result = convertContent(
      message({
        content_type: 'multimodal_text',
        parts: [{ content_type: 'audio_transcription', text: '', direction: 'in' }],
      }),
      new Map(),
    );
    expect(result.parts).toEqual([]);
    expect(result.text).toBe('');
    expect(result.files).toEqual([]);
  });
});

describe('collectAssetPointers', () => {
  it('finds pointers nested inside realtime parts', () => {
    const pointers = collectAssetPointers(
      message({
        content_type: 'multimodal_text',
        parts: [
          {
            content_type: 'real_time_user_audio_video_asset_pointer',
            audio_asset_pointer: {
              content_type: 'audio_asset_pointer',
              asset_pointer: 'sediment://file_9',
            },
          },
        ],
      }),
    );
    expect(pointers).toEqual(['sediment://file_9']);
  });
});
