const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

jest.mock('@librechat/data-schemas', () => ({ logger: mockLogger }), { virtual: true });

let resolveImportMaxFileSize: typeof import('../importLimits').resolveImportMaxFileSize;
let DEFAULT_IMPORT_MAX_FILE_SIZE: number;

async function freshImport() {
  jest.resetModules();
  const mod = await import('../import');
  resolveImportMaxFileSize = mod.resolveImportMaxFileSize;
  DEFAULT_IMPORT_MAX_FILE_SIZE = mod.DEFAULT_IMPORT_MAX_FILE_SIZE;
}

describe('resolveImportMaxFileSize', () => {
  let originalEnv: string | undefined;

  beforeEach(async () => {
    originalEnv = process.env.CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES;
    await freshImport();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES = originalEnv;
    } else {
      delete process.env.CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES;
    }
  });

  it('returns 262144000 (250 MiB) when env var is not set', () => {
    delete process.env.CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES;
    expect(resolveImportMaxFileSize()).toBe(262144000);
    expect(DEFAULT_IMPORT_MAX_FILE_SIZE).toBe(262144000);
  });

  it('returns default when env var is empty string', () => {
    process.env.CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES = '';
    expect(resolveImportMaxFileSize()).toBe(DEFAULT_IMPORT_MAX_FILE_SIZE);
  });

  it('respects a custom numeric value', () => {
    process.env.CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES = '5242880';
    expect(resolveImportMaxFileSize()).toBe(5242880);
  });

  it('parses string env var to number', () => {
    process.env.CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES = '1048576';
    expect(resolveImportMaxFileSize()).toBe(1048576);
  });

  it('falls back to default and warns for non-numeric string', () => {
    process.env.CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES = 'abc';
    expect(resolveImportMaxFileSize()).toBe(DEFAULT_IMPORT_MAX_FILE_SIZE);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Invalid CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES'),
    );
  });

  it('falls back to default and warns for negative values', () => {
    process.env.CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES = '-100';
    expect(resolveImportMaxFileSize()).toBe(DEFAULT_IMPORT_MAX_FILE_SIZE);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Invalid CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES'),
    );
  });

  it('falls back to default and warns for zero', () => {
    process.env.CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES = '0';
    expect(resolveImportMaxFileSize()).toBe(DEFAULT_IMPORT_MAX_FILE_SIZE);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Invalid CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES'),
    );
  });

  it('falls back to default and warns for Infinity', () => {
    process.env.CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES = 'Infinity';
    expect(resolveImportMaxFileSize()).toBe(DEFAULT_IMPORT_MAX_FILE_SIZE);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Invalid CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES'),
    );
  });
});
