import { sanitizeImportError } from './errors';

describe('sanitizeImportError', () => {
  it('strips the server filepath from a Node fs error', () => {
    const fsError = Object.assign(
      new Error("ENOENT: no such file or directory, open '/app/uploads/temp/u1/export.zip'"),
      { code: 'ENOENT' },
    );

    const message = sanitizeImportError(fsError, 'test');

    expect(message).not.toContain('/app/uploads');
    expect(message).not.toContain('export.zip');
    expect(message).toBe('A storage error occurred while processing the import');
  });

  it('maps a zip-bomb error to a stable archive-too-large message', () => {
    const bomb = Object.assign(new Error('Entry secret-plan.json exceeds the maximum size'), {
      code: 'ZIP_BOMB',
    });

    expect(sanitizeImportError(bomb, 'test')).toBe(
      'The uploaded archive exceeds the allowed size limits',
    );
  });

  it('passes through the Unsupported import type sentinel unchanged', () => {
    expect(sanitizeImportError(new Error('Unsupported import type'), 'test')).toBe(
      'Unsupported import type',
    );
  });

  it('maps a malformed-archive error to a stable corrupt-archive message', () => {
    expect(
      sanitizeImportError(new Error('end of central directory record not found'), 'test'),
    ).toBe('The uploaded archive is corrupt or could not be read');
  });

  it('maps a JSON parse failure to the same corrupt-archive message', () => {
    let caught: unknown;
    try {
      JSON.parse('not json');
    } catch (error) {
      caught = error;
    }

    expect(sanitizeImportError(caught, 'test')).toBe(
      'The uploaded archive is corrupt or could not be read',
    );
  });

  it('falls back to a generic message for anything unrecognized', () => {
    expect(sanitizeImportError(new Error('db down'), 'test')).toBe(
      'The import could not be completed',
    );
  });

  it('wraps a non-Error throw without leaking it verbatim', () => {
    expect(sanitizeImportError('raw string throw with /a/server/path', 'test')).toBe(
      'The import could not be completed',
    );
  });
});
