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
    expect(result.selected.map((f) => f.sandboxName)).toEqual(['rows-stateful.csv', 'rows.csv']);
    expect(getFileInfo).toHaveBeenCalledTimes(1);
    expect(await result.selected[0].getUploadTime()).toBeUndefined();
  });

  it('reserves a failed newest winner without reviving the superseded copy', async () => {
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
    expect(getFileInfo).toHaveBeenCalledTimes(2);
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

  it('recovers every expired legacy input under a distinct persisted destination', async () => {
    const originals = [file('older', 'rows.csv'), file('newer', 'rows.csv', {}, 2)];
    const recovered = await selectCodeFiles({
      files: originals,
      routeKey: 'default',
      getFileInfo: async () => null,
    });
    expect(recovered.selected).toHaveLength(2);
    expect(new Set(recovered.selected.map((f) => f.sandboxName)).size).toBe(2);
    const restored = recovered.selected.map(({ file: original, sandboxName, sourceRef }) => ({
      ...original,
      metadata: { codeEnvRef: { ...sourceRef, sandboxFilename: sandboxName } },
    }));
    const next = await selectCodeFiles({
      files: restored,
      routeKey: 'default',
      getFileInfo: async () => fresh,
    });
    expect(next.selected.map((f) => f.sandboxName)).toEqual(
      recovered.selected.map((f) => f.sandboxName),
    );
  });

  it('allocates missing legacy inputs around confirmed live aliases', async () => {
    const result = await selectCodeFiles({
      files: [
        file('missing', 'rows.csv', {}, 3),
        file('live', 'rows.csv', { sandboxFilename: 'rows.csv' }),
      ],
      routeKey: 'default',
      getFileInfo: async (ref) => (ref.file_id === 'live' ? fresh : null),
    });
    expect(result.selected.find((f) => f.file.file_id === 'live')?.sandboxName).toBe('rows.csv');
    expect(result.selected.find((f) => f.file.file_id === 'missing')?.sandboxName).not.toBe(
      'rows.csv',
    );
  });

  it.each([false, true])(
    'matches recovered image bytes while retaining a live remote name (expired=%s)',
    async (expired) => {
      const image = { ...file('image', 'plot.png'), type: 'image/webp' };
      const result = await selectCodeFiles({
        files: [image],
        routeKey: 'default',
        getFileInfo: async () => ({
          originalFilename: 'plot-alias.png',
          lastModified: expired ? '2020-01-01' : fresh.lastModified,
        }),
      });
      expect(result.selected[0].sandboxName).toBe(expired ? 'plot-alias.webp' : 'plot-alias.png');
    },
  );

  it('arbitrates collisions introduced by durable image conversion before uploading', async () => {
    const result = await selectCodeFiles({
      files: [
        { ...file('image', 'plot.png', {}, 1), type: 'image/webp' },
        file('live', 'plot.webp', { sandboxFilename: 'plot.webp' }, 2),
      ],
      routeKey: 'default',
      getFileInfo: async (ref) =>
        ref.file_id === 'live'
          ? fresh
          : { originalFilename: 'plot.png', lastModified: '2020-01-01' },
    });
    expect(result.selected.map((f) => f.file.file_id)).toEqual(['live']);
  });

  it('keeps a missing shared input independent of each agents private files', async () => {
    const shared = file('shared', 'rows.csv');
    const privateFile = file('private', 'rows.csv', { sandboxFilename: 'rows.csv' }, 2);
    const getFileInfo = async (ref: CodeEnvRef) => (ref.file_id === 'private' ? fresh : null);
    const first = await selectCodeFiles({ files: [shared], routeKey: 'default', getFileInfo });
    const second = await selectCodeFiles({
      files: [shared, privateFile],
      privateFileIds: new Set(['private']),
      routeKey: 'default',
      getFileInfo,
    });
    expect(second.selected.find((f) => f.file.file_id === 'shared')?.sandboxName).toBe(
      first.selected[0].sandboxName,
    );
  });

  it('keeps the freshness decision paired with the selected image destination', async () => {
    const now = Date.parse('2026-09-10T12:00:00Z');
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
    const result = await selectCodeFiles({
      files: [{ ...file('image', 'plot.png'), type: 'image/webp' }],
      routeKey: 'default',
      getFileInfo: async () => ({
        originalFilename: 'plot.png',
        lastModified: new Date(now - 23 * 3_600_000 + 1_000).toISOString(),
      }),
    });
    clock.mockReturnValue(now + 2_000);
    expect(result.selected[0]).toMatchObject({ isActive: true, sandboxName: 'plot.png' });
    clock.mockRestore();
  });

  it('claims alternate-route names around destinations already present in the target route', async () => {
    const missing = file('missing', 'rows.csv', { sandboxFilename: 'rows.csv' }, 2);
    const live = file('live', 'rows.csv', {
      sandboxFilename: 'rows.csv',
      executionProfile: 'stateful',
    });
    const result = await selectCodeFiles({
      files: [missing, live],
      routeKey: 'stateful',
      getFileInfo: async () => fresh,
    });
    expect(result.selected).toHaveLength(2);
    expect(result.selected.find((f) => f.file.file_id === 'live')?.sandboxName).toBe('rows.csv');
    expect(result.selected.find((f) => f.file.file_id === 'missing')?.sandboxName).not.toBe(
      'rows.csv',
    );
  });

  it.each([false, true])(
    'uses the multipart fallback only during recovery (expired=%s)',
    async (expired) => {
      const result = await selectCodeFiles({
        files: [file('nested', 'my dir/file.csv')],
        routeKey: 'default',
        getFileInfo: async () => ({
          originalFilename: 'my dir/file.csv',
          lastModified: expired ? '2020-01-01' : fresh.lastModified,
        }),
      });
      expect(result.selected[0].sandboxName).toBe(expired ? 'file.csv' : 'my dir/file.csv');
    },
  );

  it('arbitrates recovery names after the multipart adapter flattens paths', async () => {
    const result = await selectCodeFiles({
      files: [
        file('older', 'my dir/file.csv'),
        file('newer', 'file.csv', { sandboxFilename: 'file.csv' }, 2),
      ],
      routeKey: 'default',
      getFileInfo: async (ref) =>
        ref.file_id === 'newer'
          ? fresh
          : { originalFilename: 'my dir/file.csv', lastModified: '2020-01-01' },
    });
    expect(result.selected.map((f) => f.file.file_id)).toEqual(['newer']);
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
