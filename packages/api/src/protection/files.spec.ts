import type { FiltersConfig } from 'librechat-data-provider';
import {
  isFileFilterFieldEnabled,
  contentFilterUninspectableResponse,
  getBlockedOpaqueFileField,
  getBlockedUninspectableFileField,
  UninspectableFileError,
} from './files';

describe('file content inspection policy', () => {
  it('treats omitted fields as every registered file field', () => {
    const filters = {
      files: { pii: { uninspectable: 'block' } },
    } as FiltersConfig;

    expect(isFileFilterFieldEnabled(filters, 'content')).toBe(true);
    expect(getBlockedUninspectableFileField(filters, ['content', 'extracted_text'])).toBe(
      'content',
    );
  });

  it('honors field granularity and the default allow policy', () => {
    const filters = {
      files: {
        pii: {
          fields: ['name'],
          uninspectable: 'block',
        },
      },
    } as FiltersConfig;

    expect(isFileFilterFieldEnabled(filters, 'name')).toBe(true);
    expect(isFileFilterFieldEnabled(filters, 'content')).toBe(false);
    expect(getBlockedUninspectableFileField(filters, ['content', 'transcript'])).toBeNull();
    expect(
      getBlockedUninspectableFileField(
        { files: { pii: { fields: ['content'] } } } as FiltersConfig,
        ['content'],
      ),
    ).toBeNull();
  });

  it('returns a stable raw-free block response', () => {
    expect(contentFilterUninspectableResponse('transcript')).toEqual({
      error: 'content_filter_uninspectable',
      message: 'Submitted file content could not be inspected before processing.',
      source: 'file',
      field: 'transcript',
    });
  });

  it.each([
    {
      name: 'inline image data',
      input: { image_url: { url: 'data:image/png;base64,SECRET-IMAGE' } },
      field: 'content',
    },
    {
      name: 'remote image',
      input: { type: 'input_image', image_url: 'https://example.test/private.png' },
      field: 'content',
    },
    {
      name: 'file identifier',
      input: { type: 'input_file', file_id: 'file-private' },
      field: 'content',
    },
    {
      name: 'inline file data',
      input: { type: 'input_file', file_data: 'private-file-data' },
      field: 'content',
    },
    {
      name: 'inline audio',
      input: { type: 'input_audio', input_audio: { data: 'private-audio', format: 'wav' } },
      field: 'content',
    },
    {
      name: 'base64 document source',
      input: {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: 'private-document' },
      },
      field: 'content',
    },
    {
      name: 'untyped encoded data',
      input: { payload: { data: 'a'.repeat(128) } },
      field: 'content',
    },
  ])('detects opaque $name', ({ input, field }) => {
    const filters = {
      files: { pii: { uninspectable: 'block' } },
    } as FiltersConfig;

    expect(getBlockedOpaqueFileField(filters, input)).toBe(field);
  });

  it.each([
    ['file_ids', { tool_resources: { code_interpreter: { file_ids: ['file-1'] } } }],
    [
      'vector_store_ids',
      { tool_resources: { file_search: { vector_store_ids: ['vector-store-1'] } } },
    ],
  ])('detects opaque %s arrays', (_field, input) => {
    const filters = {
      files: {
        pii: {
          fields: ['extracted_text'],
          uninspectable: 'block',
        },
      },
    } as FiltersConfig;

    expect(getBlockedOpaqueFileField(filters, input)).toBe('extracted_text');
  });

  it('preserves default allow behavior and explicit file-field granularity', () => {
    const remoteImage = { type: 'input_image', image_url: 'https://example.test/image.png' };
    const imageFile = { type: 'input_image', file_id: 'image-file-id' };
    const fileData = { type: 'input_file', file_data: 'private-file-data' };
    const inputAudio = { type: 'input_audio', input_audio: { data: 'private-audio' } };

    expect(
      getBlockedOpaqueFileField(
        { files: { pii: { fields: ['content'] } } } as FiltersConfig,
        remoteImage,
      ),
    ).toBeNull();
    expect(
      getBlockedOpaqueFileField(
        {
          files: {
            pii: { fields: ['transcript'], uninspectable: 'block' },
          },
        } as FiltersConfig,
        imageFile,
      ),
    ).toBeNull();
    expect(
      getBlockedOpaqueFileField(
        {
          files: {
            pii: { fields: ['extracted_text'], uninspectable: 'block' },
          },
        } as FiltersConfig,
        remoteImage,
      ),
    ).toBeNull();
    expect(
      getBlockedOpaqueFileField(
        {
          files: {
            pii: { fields: ['extracted_text'], uninspectable: 'block' },
          },
        } as FiltersConfig,
        fileData,
      ),
    ).toBe('extracted_text');
    expect(
      getBlockedOpaqueFileField(
        {
          files: {
            pii: { fields: ['transcript'], uninspectable: 'block' },
          },
        } as FiltersConfig,
        inputAudio,
      ),
    ).toBe('transcript');
    expect(
      getBlockedOpaqueFileField(
        {
          files: {
            pii: { fields: ['transcript'], uninspectable: 'block' },
          },
        } as FiltersConfig,
        'data:audio/wav;base64,opaque-root-audio',
      ),
    ).toBe('transcript');
    expect(
      getBlockedOpaqueFileField(
        {
          files: {
            pii: { fields: ['extracted_text'], uninspectable: 'block' },
          },
        } as FiltersConfig,
        [
          { image_url: 'data:image/png;base64,irrelevant-for-extracted-text' },
          { file_data: 'opaque-file-data' },
        ],
      ),
    ).toBe('extracted_text');
  });

  it('is cycle-safe and keeps the thrown response raw-free', () => {
    const input: { file?: unknown; file_id?: string } = {};
    input.file = input;
    input.file_id = 'file-do-not-echo';
    const filters = {
      files: { pii: { fields: ['extracted_text'], uninspectable: 'block' } },
    } as FiltersConfig;

    const field = getBlockedOpaqueFileField(filters, input);
    expect(field).toBe('extracted_text');
    const error = new UninspectableFileError(field ?? 'content');
    expect(error.body).toEqual({
      error: 'content_filter_uninspectable',
      message: 'Submitted file content could not be inspected before processing.',
      source: 'file',
      field: 'extracted_text',
    });
    expect(JSON.stringify(error.body)).not.toContain('file-do-not-echo');
  });

  it('fails closed when an opaque-content traversal exceeds its depth budget', () => {
    const input: { nested?: unknown } = {};
    let cursor = input;
    for (let index = 0; index < 30; index++) {
      const nested: { nested?: unknown } = {};
      cursor.nested = nested;
      cursor = nested;
    }
    const filters = {
      files: {
        pii: {
          fields: ['extracted_text'],
          uninspectable: 'block',
        },
      },
    } as FiltersConfig;

    expect(getBlockedOpaqueFileField(filters, input)).toBe('extracted_text');
  });

  it('fails closed when opaque-content enumeration fails', () => {
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('blocked enumeration');
        },
      },
    );
    const filters = {
      files: {
        pii: {
          fields: ['extracted_text'],
          uninspectable: 'block',
        },
      },
    } as FiltersConfig;

    expect(getBlockedOpaqueFileField(filters, { content: hostile })).toBe('extracted_text');
    expect(
      getBlockedOpaqueFileField(
        {
          files: {
            pii: {
              fields: ['name'],
              uninspectable: 'block',
            },
          },
        } as FiltersConfig,
        { content: hostile },
      ),
    ).toBeNull();
  });
});
