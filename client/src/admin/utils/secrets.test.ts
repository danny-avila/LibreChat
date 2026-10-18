import {
  toSecretPreviewKey,
  getSecretPreviewValue,
  secretPathForPreviewPath,
  mapSecretPreviewPaths,
  stripSecretPreviewValues,
  filterSecretPreviewFields,
  maskSecretValues,
  MASKED_SECRET,
} from './secrets';
import { createField } from '~/admin/test/fixtures';

describe('toSecretPreviewKey', () => {
  it('capitalizes the key behind a display prefix', () => {
    expect(toSecretPreviewKey('apiKey')).toBe('apiKeyPreview');
    expect(toSecretPreviewKey('serperApiKey')).toBe('serperApiKeyPreview');
    expect(toSecretPreviewKey('secretKey')).toBe('secretKeyPreview');
  });
});

describe('getSecretPreviewValue', () => {
  it('returns the sibling display companion for a redacted secret', () => {
    expect(getSecretPreviewValue({ apiKeyPreview: 'sk-mist...4321' }, 'apiKey')).toBe(
      'sk-mist...4321',
    );
  });

  it('treats an empty display companion as not configured', () => {
    expect(getSecretPreviewValue({ apiKeyPreview: '' }, 'apiKey')).toBeUndefined();
  });

  it('returns undefined for missing companions and non-object parents', () => {
    expect(getSecretPreviewValue({ baseURL: 'x' }, 'apiKey')).toBeUndefined();
    expect(getSecretPreviewValue('sk-real', 'apiKey')).toBeUndefined();
    expect(getSecretPreviewValue(null, 'apiKey')).toBeUndefined();
    expect(getSecretPreviewValue(['apiKeyPreview'], 'apiKey')).toBeUndefined();
  });
});

describe('secretPathForPreviewPath', () => {
  const schemaPaths = new Set(['ocr.apiKey', 'webSearch.serperApiKey', 'langfuse.secretKey']);

  it('maps a display companion path to its schema secret path', () => {
    expect(secretPathForPreviewPath('ocr.apiKeyPreview', schemaPaths)).toBe('ocr.apiKey');
    expect(secretPathForPreviewPath('webSearch.serperApiKeyPreview', schemaPaths)).toBe(
      'webSearch.serperApiKey',
    );
    expect(secretPathForPreviewPath('langfuse.secretKeyPreview', schemaPaths)).toBe(
      'langfuse.secretKey',
    );
  });

  it('rejects preview-shaped paths without a matching schema secret', () => {
    expect(secretPathForPreviewPath('ocr.fooPreview', schemaPaths)).toBeNull();
    expect(secretPathForPreviewPath('interface.modelDisplayLabelPreview', schemaPaths)).toBeNull();
    expect(secretPathForPreviewPath('ocr.apiKey', schemaPaths)).toBeNull();
  });

  it('maps an array-entry preview path to its index-free schema secret path', () => {
    const arraySchemaPaths = new Set(['endpoints.custom.apiKey']);
    expect(secretPathForPreviewPath('endpoints.custom.0.apiKeyPreview', arraySchemaPaths)).toBe(
      'endpoints.custom.0.apiKey',
    );
    expect(secretPathForPreviewPath('endpoints.custom.12.apiKeyPreview', arraySchemaPaths)).toBe(
      'endpoints.custom.12.apiKey',
    );
  });
});

describe('mapSecretPreviewPaths', () => {
  it('replaces display companion paths and passes other paths through', () => {
    const schemaPaths = new Set(['ocr.apiKey']);
    const mapped = mapSecretPreviewPaths(['ocr.apiKeyPreview', 'ocr.baseURL'], schemaPaths);
    expect(mapped).toEqual(new Set(['ocr.apiKey', 'ocr.baseURL']));
  });
});

describe('stripSecretPreviewValues', () => {
  const schemaPaths = new Set([
    'ocr.apiKey',
    'speech.tts.openai.apiKey',
    'endpoints.custom.apiKey',
  ]);

  it('removes display companion strings from object values', () => {
    const value = { apiKeyPreview: 'sk-mist...4321', model: 'tts-1' };
    expect(stripSecretPreviewValues(value, 'speech.tts.openai', schemaPaths)).toEqual({
      model: 'tts-1',
    });
  });

  it('recurses through nested objects from the edit root', () => {
    const value = { tts: { openai: { apiKeyPreview: 'sk-abc...1111', model: 'tts-1' } } };
    expect(stripSecretPreviewValues(value, 'speech', schemaPaths)).toEqual({
      tts: { openai: { model: 'tts-1' } },
    });
  });

  it('recurses through array entries', () => {
    const value = [{ name: 'ep', apiKeyPreview: 'sk-abc...1111' }];
    expect(stripSecretPreviewValues(value, 'endpoints.custom', schemaPaths)).toEqual([
      { name: 'ep' },
    ]);
  });

  it('keeps non-string values under display-shaped keys', () => {
    const value = { apiKeyPreview: { nested: true } };
    expect(stripSecretPreviewValues(value, 'ocr', schemaPaths)).toEqual({
      apiKeyPreview: { nested: true },
    });
  });

  it('keeps preview-shaped keys with no matching schema secret', () => {
    const value = { fooPreview: 'bar', apiKey: 'typed-by-admin' };
    expect(stripSecretPreviewValues(value, 'ocr', schemaPaths)).toEqual(value);
  });

  it('passes primitives through untouched', () => {
    expect(stripSecretPreviewValues('sk-typed', 'ocr.apiKey', schemaPaths)).toBe('sk-typed');
    expect(stripSecretPreviewValues(7, 'ocr.apiKey', schemaPaths)).toBe(7);
    expect(stripSecretPreviewValues(null, 'ocr.apiKey', schemaPaths)).toBeNull();
  });
});

describe('filterSecretPreviewFields', () => {
  it('drops display companions of a sibling secret field', () => {
    const fields = [
      createField({ key: 'apiKey', type: 'string' }),
      createField({ key: 'apiKeyPreview', type: 'string' }),
      createField({ key: 'baseURL', type: 'string' }),
    ];
    expect(filterSecretPreviewFields(fields).map((f) => f.key)).toEqual(['apiKey', 'baseURL']);
  });

  it('keeps preview-shaped fields without a sibling secret', () => {
    const fields = [createField({ key: 'modelDisplayLabelPreview', type: 'string' })];
    expect(filterSecretPreviewFields(fields)).toEqual(fields);
  });

  it('keeps non-string display-shaped fields', () => {
    const fields = [
      createField({ key: 'apiKey', type: 'string' }),
      createField({ key: 'apiKeyPreview', type: 'object', isObject: true }),
    ];
    expect(filterSecretPreviewFields(fields)).toHaveLength(2);
  });
});

describe('maskSecretValues', () => {
  it('masks secret keys at any depth and leaves other values alone', () => {
    expect(
      maskSecretValues([{ group: 'eastus', apiKey: '${EASTUS_API_KEY}', models: { m: true } }]),
    ).toEqual([{ group: 'eastus', apiKey: MASKED_SECRET, models: { m: true } }]);
  });

  it('masks a secret leaf passed on its own, but not an empty one', () => {
    expect(maskSecretValues('sk-live', 'apiKey')).toBe(MASKED_SECRET);
    expect(maskSecretValues('', 'apiKey')).toBe('');
    expect(maskSecretValues('https://x', 'baseURL')).toBe('https://x');
  });
});
