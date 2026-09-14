import type { FiltersConfig } from 'librechat-data-provider';
import {
  UPLOAD_FALLBACK_TEXT_PLANS,
  getUploadFallbackTextPlan,
  resolveUploadFallbackText,
} from './fallback';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const csvRoute = {
  deliveryPath: 'none' as const,
  mimeType: 'text/csv',
  endpointConfig: { textFallbackWithoutTools: true },
};

describe('getUploadFallbackTextPlan', () => {
  it('reads a natively textual file left to tools', () => {
    expect(getUploadFallbackTextPlan(csvRoute)).toBe(UPLOAD_FALLBACK_TEXT_PLANS.nativeText);
  });

  it('parses a spreadsheet with the built-in document parser', () => {
    expect(getUploadFallbackTextPlan({ ...csvRoute, mimeType: XLSX_MIME })).toBe(
      UPLOAD_FALLBACK_TEXT_PLANS.documentParser,
    );
  });

  it('runs nothing for a type no built-in extractor can read', () => {
    expect(getUploadFallbackTextPlan({ ...csvRoute, mimeType: 'image/png' })).toBeNull();
    expect(getUploadFallbackTextPlan({ ...csvRoute, mimeType: 'application/zip' })).toBeNull();
  });

  it('runs nothing where the upload endpoint has not enabled the fallback', () => {
    expect(getUploadFallbackTextPlan({ ...csvRoute, endpointConfig: undefined })).toBeNull();
    expect(
      getUploadFallbackTextPlan({
        ...csvRoute,
        endpointConfig: { textFallbackWithoutTools: false },
      }),
    ).toBeNull();
  });

  it('runs nothing for an upload that already reaches the model', () => {
    expect(getUploadFallbackTextPlan({ ...csvRoute, deliveryPath: 'text' })).toBeNull();
    expect(getUploadFallbackTextPlan({ ...csvRoute, deliveryPath: 'provider' })).toBeNull();
  });

  it('respects a tool destination the user named', () => {
    expect(getUploadFallbackTextPlan({ ...csvRoute, toolResource: 'execute_code' })).toBeNull();
  });

  it('skips extraction for an upload filed under a tool that reads it', () => {
    expect(
      getUploadFallbackTextPlan({ ...csvRoute, destinationToolResource: 'execute_code' }),
    ).toBeNull();
  });
});

describe('resolveUploadFallbackText', () => {
  const privateTokenFilters: FiltersConfig = {
    files: {
      pii: {
        fields: ['extracted_text'],
        starterPatterns: [],
        customPatterns: [{ id: 'private', label: 'private token', regex: 'PRIVATE-[A-Z]+' }],
      },
    },
  };

  function setup({
    documentText = 'Sheet1\nregion,total\nwest,4',
    nativeText = 'region,total\nwest,4',
  }: { documentText?: string | null; nativeText?: string | null } = {}) {
    const extractDocument = jest.fn(async () => ({ text: documentText }));
    const readNativeText = jest.fn(async () => ({ text: nativeText }));
    return {
      extractDocument,
      readNativeText,
      base: { filename: 'sales.csv', fileId: 'file-1', extractDocument, readNativeText },
    };
  }

  it('stores native text for a CSV without running the document parser', async () => {
    const { base, extractDocument, readNativeText } = setup();

    await expect(resolveUploadFallbackText({ ...base, ...csvRoute })).resolves.toBe(
      'region,total\nwest,4',
    );
    expect(readNativeText).toHaveBeenCalledTimes(1);
    expect(extractDocument).not.toHaveBeenCalled();
  });

  it('stores parsed text for a spreadsheet without decoding its bytes', async () => {
    const { base, extractDocument, readNativeText } = setup();

    await expect(
      resolveUploadFallbackText({ ...base, ...csvRoute, mimeType: XLSX_MIME }),
    ).resolves.toBe('Sheet1\nregion,total\nwest,4');
    expect(extractDocument).toHaveBeenCalledTimes(1);
    expect(readNativeText).not.toHaveBeenCalled();
  });

  it('extracts nothing when no plan applies', async () => {
    const { base, extractDocument, readNativeText } = setup();

    await expect(
      resolveUploadFallbackText({ ...base, ...csvRoute, destinationToolResource: 'execute_code' }),
    ).resolves.toBeUndefined();
    expect(extractDocument).not.toHaveBeenCalled();
    expect(readNativeText).not.toHaveBeenCalled();
  });

  it('keeps the upload when extraction fails', async () => {
    const { base, readNativeText } = setup();
    readNativeText.mockRejectedValueOnce(new Error('unreadable'));

    await expect(resolveUploadFallbackText({ ...base, ...csvRoute })).resolves.toBeUndefined();
  });

  it('stores nothing for text with no content', async () => {
    const { base } = setup({ nativeText: '  \n ' });

    await expect(resolveUploadFallbackText({ ...base, ...csvRoute })).resolves.toBeUndefined();
  });

  it('stores nothing past the extracted-text storage cap', async () => {
    const { base } = setup({ nativeText: 'a'.repeat(15 * 1024 * 1024 + 1) });

    await expect(resolveUploadFallbackText({ ...base, ...csvRoute })).resolves.toBeUndefined();
  });

  it('stores nothing a configured content policy flags, and keeps text it does not', async () => {
    const flagged = setup({ nativeText: 'token,PRIVATE-SECRET' });
    const clean = setup({ nativeText: 'region,total' });

    await expect(
      resolveUploadFallbackText({ ...flagged.base, ...csvRoute, filters: privateTokenFilters }),
    ).resolves.toBeUndefined();
    await expect(
      resolveUploadFallbackText({ ...clean.base, ...csvRoute, filters: privateTokenFilters }),
    ).resolves.toBe('region,total');
  });

  it('stores nothing a blocking policy cannot inspect', async () => {
    const { base } = setup({ nativeText: null });
    const filters: FiltersConfig = {
      files: { pii: { fields: ['extracted_text'], starterPatterns: [], uninspectable: 'block' } },
    };

    await expect(
      resolveUploadFallbackText({ ...base, ...csvRoute, filters }),
    ).resolves.toBeUndefined();
  });
});
