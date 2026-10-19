import { getProjectFileAvailability, getProjectUploadResource } from './projects';
import { FileContext, FileSources } from './types/files';
import { EToolResources } from './types/tools';

const dataTypes = [
  'text/csv',
  'text/tab-separated-values',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.spreadsheet',
];

describe('project file destinations', () => {
  it.each(dataTypes)('uploads %s to Run Code without indexing', (type) => {
    expect(getProjectUploadResource(type, { fileSearch: true, codeExecution: true })).toBe(
      EToolResources.execute_code,
    );
    expect(
      getProjectUploadResource(type, { fileSearch: true, codeExecution: false }),
    ).toBeUndefined();
  });

  it('keeps searchable documents on File Search and supports code-only permissions', () => {
    expect(
      getProjectUploadResource('application/pdf', { fileSearch: true, codeExecution: true }),
    ).toBe(EToolResources.file_search);
    expect(
      getProjectUploadResource('application/pdf', { fileSearch: false, codeExecution: true }),
    ).toBe(EToolResources.execute_code);
    expect(
      getProjectUploadResource('application/pdf', { fileSearch: false, codeExecution: false }),
    ).toBeUndefined();
  });

  it.each(dataTypes)(
    'admits backed %s project uploads only when code sharing is enabled',
    (type) => {
      const file = {
        type,
        embedded: false,
        context: FileContext.message_attachment,
        source: FileSources.local,
      };
      expect(getProjectFileAvailability(file)).toBe('unavailable');
      expect(getProjectFileAvailability(file, true)).toBe('ready');
    },
  );

  it('admits explicitly saved code outputs, while refusing agent setup and unbacked files', () => {
    const file = { type: 'text/csv', source: FileSources.s3, embedded: false };
    for (const context of [FileContext.execute_code, FileContext.run_artifact]) {
      expect(getProjectFileAvailability({ ...file, context }, true)).toBe('ready');
    }
    for (const context of [FileContext.agents, FileContext.skill_file, FileContext.assistants]) {
      expect(getProjectFileAvailability({ ...file, context }, true)).toBe('unavailable');
    }
    for (const source of [FileSources.text, FileSources.openai, FileSources.execute_code]) {
      expect(
        getProjectFileAvailability(
          { ...file, source, context: FileContext.message_attachment },
          true,
        ),
      ).toBe('unavailable');
    }
  });

  it('preserves legacy indexed references and rejects expired or invalid expiries', () => {
    const file = { embedded: true, context: FileContext.message_attachment };
    expect(getProjectFileAvailability(file)).toBe('ready');
    for (const expiredAt of [new Date(0), 0, 'invalid', '1970-01-01T00:00:00.000Z']) {
      expect(getProjectFileAvailability({ ...file, expiredAt }, true)).toBe('unavailable');
    }
    expect(
      getProjectFileAvailability({
        ...file,
        expiredAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    ).toBe('ready');
  });
});
