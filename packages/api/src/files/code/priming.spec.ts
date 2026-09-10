import type { CodeEnvRef, TFile } from 'librechat-data-provider';
import { selectCodeFiles } from './priming';

const file = (id: string, name: string, ref: Partial<CodeEnvRef> = {}, time = 1): TFile =>
  ({
    file_id: id,
    filename: name,
    type: 'text/csv',
    createdAt: new Date(time),
    metadata: {
      codeEnvRef: { kind: 'user', id: 'user', storage_session_id: id, file_id: id, ...ref },
    },
  }) as TFile;

const fresh = { lastModified: new Date().toISOString() };

describe('selectCodeFiles', () => {
  it('preserves provisioned aliases across turns and reuses legacy metadata probes', async () => {
    const getFileInfo = jest.fn(async (ref: CodeEnvRef) => ({
      ...fresh,
      originalFilename: ref.file_id === 'older' ? 'rows-alias.csv' : 'rows.csv',
    }));
    const result = await selectCodeFiles({
      files: [file('older', 'rows.csv'), file('newer', 'rows.csv', {}, 2)],
      routeKey: 'default',
      getFileInfo,
    });
    expect(result.selected.map((f) => f.sandboxName)).toEqual(['rows.csv', 'rows-alias.csv']);
    await Promise.all(result.selected.map((f) => f.getUploadTime()));
    expect(getFileInfo).toHaveBeenCalledTimes(2);
  });

  it('keeps stored aliases when expired and selects the requested deployment reference', async () => {
    const older = file('older', 'rows.csv', { sandboxFilename: 'rows-old.csv' });
    older.metadata!.codeEnvRefs = {
      stateful: {
        kind: 'user',
        id: 'user',
        storage_session_id: 'stateful',
        file_id: 'remote',
        sandboxFilename: 'rows-stateful.csv',
        executionProfile: 'stateful',
      },
    };
    const getFileInfo = jest.fn(async () => null);
    const result = await selectCodeFiles({
      files: [older, file('newer', 'rows.csv', { sandboxFilename: 'rows.csv' }, 2)],
      routeKey: 'stateful',
      getFileInfo,
    });
    expect(result.selected.map((f) => f.sandboxName)).toEqual(['rows.csv', 'rows-stateful.csv']);
    expect(getFileInfo).not.toHaveBeenCalled();
    expect(await result.selected[1].getUploadTime()).toBeUndefined();
  });

  it('reserves a failed newest winner without probing or reviving the superseded copy', async () => {
    const getFileInfo = jest.fn(async () => null);
    const result = await selectCodeFiles({
      files: [
        file('older', 'rows.csv', { sandboxFilename: 'rows.csv' }),
        file('newer', 'rows.csv', { sandboxFilename: 'rows.csv' }, 2),
      ],
      routeKey: 'default',
      getFileInfo,
    });
    expect(result.selected.map((f) => f.file.file_id)).toEqual(['newer']);
    expect(result.skippedSuperseded).toBe(1);
    await result.selected[0].getUploadTime();
    expect(getFileInfo).toHaveBeenCalledTimes(1);
  });

  it('lets an output supersede an aliased upload at its actual destination', async () => {
    const result = await selectCodeFiles({
      files: [
        file('upload', 'rows.csv', { sandboxFilename: 'rows-alias.csv' }),
        file('output', 'rows-alias.csv', {}, 2),
      ],
      routeKey: 'default',
      getFileInfo: async () => fresh,
    });
    expect(result.selected.map((f) => f.file.file_id)).toEqual(['output']);
  });

  it('keeps shared content ahead of private resources and rejects ancestor conflicts', async () => {
    const result = await selectCodeFiles({
      files: [file('shared', 'data/rows.csv'), file('private', 'data', {}, 2)],
      privateFileIds: new Set(['private']),
      routeKey: 'default',
      getFileInfo: async () => fresh,
    });
    expect(result.selected.map((f) => f.file.file_id)).toEqual(['shared']);
  });

  it('propagates cancellation during legacy recovery', async () => {
    const controller = new AbortController();
    const reason = new Error('cancelled');
    await expect(
      selectCodeFiles({
        files: [file('old', 'rows.csv')],
        routeKey: 'default',
        signal: controller.signal,
        getFileInfo: async () => {
          controller.abort(reason);
          return null;
        },
      }),
    ).rejects.toBe(reason);
  });
});
