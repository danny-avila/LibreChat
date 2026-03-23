import { megabyte, fileConfig as defaultFileConfig } from 'librechat-data-provider';
import type { EndpointFileConfig, FileConfig } from 'librechat-data-provider';
import type { ExtendedFile } from '~/common';
import { validateFiles } from '../files';

const supportedMimeTypes = defaultFileConfig.endpoints.default.supportedMimeTypes;

function makeEndpointConfig(overrides: Partial<EndpointFileConfig> = {}): EndpointFileConfig {
  return {
    fileLimit: 10,
    fileSizeLimit: 25 * megabyte,
    totalSizeLimit: 100 * megabyte,
    supportedMimeTypes,
    disabled: false,
    ...overrides,
  };
}

function makeFile(name: string, type: string, size: number): File {
  const content = new ArrayBuffer(size);
  return new File([content], name, { type });
}

function makeExtendedFile(overrides: Partial<ExtendedFile> = {}): ExtendedFile {
  return {
    file_id: 'ext-1',
    size: 1024,
    progress: 1,
    type: 'application/pdf',
    ...overrides,
  };
}

describe('validateFiles', () => {
  let setError: jest.Mock;
  let files: Map<string, ExtendedFile>;
  let endpointFileConfig: EndpointFileConfig;
  const fileConfig: FileConfig | null = null;

  beforeEach(() => {
    setError = jest.fn();
    files = new Map();
    endpointFileConfig = makeEndpointConfig();
  });

  it('returns true when all checks pass', () => {
    const fileList = [makeFile('doc.pdf', 'application/pdf', 1024)];
    const result = validateFiles({ files, fileList, setError, endpointFileConfig, fileConfig });
    expect(result).toBe(true);
    expect(setError).not.toHaveBeenCalled();
  });

  it('rejects when endpoint is disabled', () => {
    endpointFileConfig = makeEndpointConfig({ disabled: true });
    const fileList = [makeFile('doc.pdf', 'application/pdf', 1024)];
    const result = validateFiles({ files, fileList, setError, endpointFileConfig, fileConfig });
    expect(result).toBe(false);
    expect(setError).toHaveBeenCalledWith('com_ui_attach_error_disabled');
  });

  it('rejects empty files (zero bytes)', () => {
    const fileList = [makeFile('empty.pdf', 'application/pdf', 0)];
    const result = validateFiles({ files, fileList, setError, endpointFileConfig, fileConfig });
    expect(result).toBe(false);
    expect(setError).toHaveBeenCalledWith('com_error_files_empty');
  });

  it('rejects when fileLimit would be exceeded', () => {
    endpointFileConfig = makeEndpointConfig({ fileLimit: 3 });
    files = new Map([
      ['f1', makeExtendedFile({ file_id: 'f1', filename: 'one.pdf', size: 2048 })],
      ['f2', makeExtendedFile({ file_id: 'f2', filename: 'two.pdf', size: 3072 })],
    ]);
    const fileList = [
      makeFile('a.pdf', 'application/pdf', 1024),
      makeFile('b.pdf', 'application/pdf', 2048),
    ];
    const result = validateFiles({ files, fileList, setError, endpointFileConfig, fileConfig });
    expect(result).toBe(false);
    expect(setError).toHaveBeenCalledWith('File limit reached: 3 files');
  });

  it('allows upload when exactly at fileLimit boundary', () => {
    endpointFileConfig = makeEndpointConfig({ fileLimit: 3 });
    files = new Map([
      ['f1', makeExtendedFile({ file_id: 'f1', filename: 'one.pdf', size: 2048 })],
      ['f2', makeExtendedFile({ file_id: 'f2', filename: 'two.pdf', size: 3072 })],
    ]);
    const fileList = [makeFile('a.pdf', 'application/pdf', 1024)];
    const result = validateFiles({ files, fileList, setError, endpointFileConfig, fileConfig });
    expect(result).toBe(true);
  });

  it('rejects unsupported MIME type', () => {
    const fileList = [makeFile('data.xyz', 'application/x-unknown', 1024)];
    const result = validateFiles({ files, fileList, setError, endpointFileConfig, fileConfig });
    expect(result).toBe(false);
    expect(setError).toHaveBeenCalledWith('Unsupported file type: application/x-unknown');
  });

  it('rejects when file size equals fileSizeLimit (>= comparison)', () => {
    const limit = 5 * megabyte;
    endpointFileConfig = makeEndpointConfig({ fileSizeLimit: limit });
    const fileList = [makeFile('exact.pdf', 'application/pdf', limit)];
    const result = validateFiles({ files, fileList, setError, endpointFileConfig, fileConfig });
    expect(result).toBe(false);
    expect(setError).toHaveBeenCalledWith(`File size limit exceeded: ${limit / megabyte} MB`);
  });

  it('allows file just under fileSizeLimit', () => {
    const limit = 5 * megabyte;
    endpointFileConfig = makeEndpointConfig({ fileSizeLimit: limit });
    const fileList = [makeFile('under.pdf', 'application/pdf', limit - 1)];
    const result = validateFiles({ files, fileList, setError, endpointFileConfig, fileConfig });
    expect(result).toBe(true);
  });

  it('rejects when totalSizeLimit would be exceeded', () => {
    const limit = 10 * megabyte;
    endpointFileConfig = makeEndpointConfig({ totalSizeLimit: limit });
    files = new Map([['f1', makeExtendedFile({ file_id: 'f1', size: 6 * megabyte })]]);
    const fileList = [makeFile('big.pdf', 'application/pdf', 5 * megabyte)];
    const result = validateFiles({ files, fileList, setError, endpointFileConfig, fileConfig });
    expect(result).toBe(false);
    expect(setError).toHaveBeenCalledWith(`Total file size limit exceeded: ${limit / megabyte} MB`);
  });

  it('allows when totalSizeLimit is exactly met', () => {
    const limit = 10 * megabyte;
    endpointFileConfig = makeEndpointConfig({ totalSizeLimit: limit });
    files = new Map([['f1', makeExtendedFile({ file_id: 'f1', size: 5 * megabyte })]]);
    const fileList = [makeFile('fits.pdf', 'application/pdf', 5 * megabyte)];
    const result = validateFiles({ files, fileList, setError, endpointFileConfig, fileConfig });
    expect(result).toBe(true);
  });

  it('rejects duplicate files', () => {
    files = new Map([
      [
        'f1',
        makeExtendedFile({
          file_id: 'f1',
          file: makeFile('doc.pdf', 'application/pdf', 1024),
          filename: 'doc.pdf',
          size: 1024,
          type: 'application/pdf',
        }),
      ],
    ]);
    const fileList = [makeFile('doc.pdf', 'application/pdf', 1024)];
    const result = validateFiles({ files, fileList, setError, endpointFileConfig, fileConfig });
    expect(result).toBe(false);
    expect(setError).toHaveBeenCalledWith('com_error_files_dupe');
  });

  it('enforces check ordering: disabled before fileLimit', () => {
    endpointFileConfig = makeEndpointConfig({ disabled: true, fileLimit: 1 });
    files = new Map([['f1', makeExtendedFile({ file_id: 'f1', filename: 'existing.pdf' })]]);
    const fileList = [makeFile('doc.pdf', 'application/pdf', 1024)];
    validateFiles({ files, fileList, setError, endpointFileConfig, fileConfig });
    expect(setError).toHaveBeenCalledWith('com_ui_attach_error_disabled');
  });

  it('enforces check ordering: fileLimit before fileSizeLimit', () => {
    const limit = 1;
    endpointFileConfig = makeEndpointConfig({ fileLimit: 1, fileSizeLimit: limit });
    files = new Map([['f1', makeExtendedFile({ file_id: 'f1', filename: 'existing.pdf' })]]);
    const fileList = [makeFile('huge.pdf', 'application/pdf', limit)];
    validateFiles({ files, fileList, setError, endpointFileConfig, fileConfig });
    expect(setError).toHaveBeenCalledWith('File limit reached: 1 files');
  });
});
