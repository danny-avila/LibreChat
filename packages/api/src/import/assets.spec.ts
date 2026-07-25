import type { Archive } from './archive';

import { buildFixtureExport, cleanupFixtureExport } from './__data__/fixture';
import { ASSET_NAMES_ENTRY, parseManifest, resolveLayout } from './manifest';
import { pointerToEntry, ingestAssets } from './assets';
import { openArchive } from './archive';

/** Redirects reads of the asset name map to `raw`, delegating every other
 * entry to the real archive, so a test can control that one file's
 * contents without hand-building a whole zip fixture. */
function withAssetNames(archive: Archive, raw: string): Archive {
  return {
    ...archive,
    read: (name: string) =>
      name === ASSET_NAMES_ENTRY ? Promise.resolve(Buffer.from(raw, 'utf8')) : archive.read(name),
  };
}

describe('pointerToEntry', () => {
  it('maps both pointer schemes onto .dat names', () => {
    expect(pointerToEntry('file-service://file-ABC')).toBe('file-ABC.dat');
    expect(pointerToEntry('sediment://file_0000abc')).toBe('file_0000abc.dat');
    expect(pointerToEntry('file-XYZ')).toBe('file-XYZ.dat');
  });
});

describe('ingestAssets', () => {
  afterEach(() => {
    cleanupFixtureExport();
  });

  it('imports referenced assets and reports the missing ones', async () => {
    const filepath = await buildFixtureExport();
    const archive = await openArchive(filepath);
    const layout = resolveLayout(
      archive.entries,
      parseManifest(await archive.read('export_manifest.json')),
    );

    const saved: Array<{ fileName: string; bytes: number }> = [];
    const result = await ingestAssets({
      archive,
      layout,
      userId: 'u1',
      tenantId: undefined,
      source: 'local',
      pointers: ['file-service://file-one', 'file-service://file-two', 'sediment://file_gone'],
      deps: {
        saveBuffer: async ({ fileName, buffer }) => {
          saved.push({ fileName, bytes: buffer.byteLength });
          return `/uploads/u1/${fileName}`;
        },
        createFile: async (data) => ({ file_id: data.file_id as string }),
      },
    });

    expect(result.imported).toBe(2);
    expect(result.unavailable).toBe(1);
    expect(result.map.size).toBe(2);
    expect(result.map.has('file-service://file-one')).toBe(true);
    expect(result.map.has('sediment://file_gone')).toBe(false);
    expect(saved).toHaveLength(2);

    archive.close();
  });

  it('restores original filenames from the asset name map', async () => {
    const filepath = await buildFixtureExport();
    const archive = await openArchive(filepath);
    const layout = resolveLayout(
      archive.entries,
      parseManifest(await archive.read('export_manifest.json')),
    );

    const names: string[] = [];
    await ingestAssets({
      archive,
      layout,
      userId: 'u1',
      tenantId: undefined,
      source: 'local',
      pointers: ['file-service://file-one'],
      deps: {
        saveBuffer: async ({ fileName }) => {
          names.push(fileName);
          return `/uploads/u1/${fileName}`;
        },
        createFile: async (data) => ({ file_id: data.file_id as string }),
      },
    });

    expect(names[0]).toContain('first.jpg');
    archive.close();
  });

  it('records a storage failure without aborting the rest', async () => {
    const filepath = await buildFixtureExport();
    const archive = await openArchive(filepath);
    const layout = resolveLayout(
      archive.entries,
      parseManifest(await archive.read('export_manifest.json')),
    );

    let calls = 0;
    const result = await ingestAssets({
      archive,
      layout,
      userId: 'u1',
      tenantId: undefined,
      source: 'local',
      pointers: ['file-service://file-one', 'file-service://file-two'],
      deps: {
        saveBuffer: async ({ fileName }) => {
          calls += 1;
          if (calls === 1) {
            throw new Error('quota exceeded');
          }
          return `/uploads/u1/${fileName}`;
        },
        createFile: async (data) => ({ file_id: data.file_id as string }),
      },
    });

    expect(result.imported).toBe(1);
    expect(result.errors).toHaveLength(1);
    // The raw storage-driver message never reaches the client; only a
    // stable, sanitized category message does (see errors.spec.ts).
    expect(result.errors[0]).not.toContain('quota exceeded');
    expect(result.errors[0]).toContain('The import could not be completed');

    archive.close();
  });

  it('populates width and height from a matching attachment', async () => {
    const filepath = await buildFixtureExport();
    const archive = await openArchive(filepath);
    const layout = resolveLayout(
      archive.entries,
      parseManifest(await archive.read('export_manifest.json')),
    );

    const result = await ingestAssets({
      archive,
      layout,
      userId: 'u1',
      tenantId: undefined,
      source: 'local',
      pointers: ['file-service://file-one'],
      attachments: new Map([['file-one', { id: 'file-one', width: 640, height: 480 }]]),
      deps: {
        saveBuffer: async ({ fileName }) => `/uploads/u1/${fileName}`,
        createFile: async (data) => ({ file_id: data.file_id as string }),
      },
    });

    const asset = result.map.get('file-service://file-one');
    expect(asset?.width).toBe(640);
    expect(asset?.height).toBe(480);

    archive.close();
  });

  it('stops after isCancelled turns true, without touching later assets', async () => {
    const filepath = await buildFixtureExport();
    const archive = await openArchive(filepath);
    const layout = resolveLayout(
      archive.entries,
      parseManifest(await archive.read('export_manifest.json')),
    );

    const saveCalls: string[] = [];
    let cancelChecks = 0;
    const result = await ingestAssets({
      archive,
      layout,
      userId: 'u1',
      tenantId: undefined,
      source: 'local',
      pointers: ['file-service://file-one', 'file-service://file-two'],
      isCancelled: async () => {
        cancelChecks += 1;
        return cancelChecks > 1;
      },
      deps: {
        saveBuffer: async ({ fileName }) => {
          saveCalls.push(fileName);
          return `/uploads/u1/${fileName}`;
        },
        createFile: async (data) => ({ file_id: data.file_id as string }),
      },
    });

    expect(saveCalls).toHaveLength(1);
    expect(result.imported).toBe(1);
    expect(result.map.size).toBe(1);

    archive.close();
  });

  it('ingests a pointer referenced multiple times exactly once', async () => {
    const filepath = await buildFixtureExport();
    const archive = await openArchive(filepath);
    const layout = resolveLayout(
      archive.entries,
      parseManifest(await archive.read('export_manifest.json')),
    );

    const saveCalls: string[] = [];
    const result = await ingestAssets({
      archive,
      layout,
      userId: 'u1',
      tenantId: undefined,
      source: 'local',
      pointers: ['file-service://file-one', 'file-service://file-one', 'file-service://file-one'],
      deps: {
        saveBuffer: async ({ fileName }) => {
          saveCalls.push(fileName);
          return `/uploads/u1/${fileName}`;
        },
        createFile: async (data) => ({ file_id: data.file_id as string }),
      },
    });

    expect(saveCalls).toHaveLength(1);
    expect(result.map.size).toBe(1);
    expect(result.imported).toBe(1);

    archive.close();
  });

  it('falls back to the bare entry name when the export has no asset name map', async () => {
    const filepath = await buildFixtureExport();
    const archive = await openArchive(filepath);
    const layout = resolveLayout(
      archive.entries,
      parseManifest(await archive.read('export_manifest.json')),
    );

    const result = await ingestAssets({
      archive,
      layout: { ...layout, assetNames: null },
      userId: 'u1',
      tenantId: undefined,
      source: 'local',
      pointers: ['file-service://file-one'],
      deps: {
        saveBuffer: async ({ fileName }) => `/uploads/u1/${fileName}`,
        createFile: async (data) => ({ file_id: data.file_id as string }),
      },
    });

    expect(result.map.get('file-service://file-one')?.filename).toBe('file-one');

    archive.close();
  });

  it('continues ingesting when the asset name map is malformed JSON', async () => {
    const filepath = await buildFixtureExport();
    const archive = await openArchive(filepath);
    const layout = resolveLayout(
      archive.entries,
      parseManifest(await archive.read('export_manifest.json')),
    );

    const result = await ingestAssets({
      archive: withAssetNames(archive, 'not json'),
      layout,
      userId: 'u1',
      tenantId: undefined,
      source: 'local',
      pointers: ['file-service://file-one'],
      deps: {
        saveBuffer: async ({ fileName }) => `/uploads/u1/${fileName}`,
        createFile: async (data) => ({ file_id: data.file_id as string }),
      },
    });

    expect(result.imported).toBe(1);
    expect(result.map.get('file-service://file-one')?.filename).toBe('file-one');

    archive.close();
  });

  it('falls back to the entry name for a .dat file missing from the name map', async () => {
    const filepath = await buildFixtureExport();
    const archive = await openArchive(filepath);
    const layout = resolveLayout(
      archive.entries,
      parseManifest(await archive.read('export_manifest.json')),
    );

    const result = await ingestAssets({
      archive: withAssetNames(archive, JSON.stringify({ 'file-two.dat': 'second.jpg' })),
      layout,
      userId: 'u1',
      tenantId: undefined,
      source: 'local',
      pointers: ['file-service://file-one'],
      deps: {
        saveBuffer: async ({ fileName }) => `/uploads/u1/${fileName}`,
        createFile: async (data) => ({ file_id: data.file_id as string }),
      },
    });

    expect(result.map.get('file-service://file-one')?.filename).toBe('file-one');

    archive.close();
  });

  it('reports progress as each asset completes', async () => {
    const filepath = await buildFixtureExport();
    const archive = await openArchive(filepath);
    const layout = resolveLayout(
      archive.entries,
      parseManifest(await archive.read('export_manifest.json')),
    );

    const progress: number[] = [];
    await ingestAssets({
      archive,
      layout,
      userId: 'u1',
      tenantId: undefined,
      source: 'local',
      pointers: ['file-service://file-one', 'file-service://file-two'],
      onProgress: (done) => progress.push(done),
      deps: {
        saveBuffer: async ({ fileName }) => `/uploads/u1/${fileName}`,
        createFile: async (data) => ({ file_id: data.file_id as string }),
      },
    });

    expect(progress).toEqual([1, 2]);

    archive.close();
  });

  it('falls back to application/octet-stream for an unknown extension while keeping a real MIME type for known ones', async () => {
    const filepath = await buildFixtureExport();
    const archive = await openArchive(filepath);
    const layout = resolveLayout(
      archive.entries,
      parseManifest(await archive.read('export_manifest.json')),
    );

    const result = await ingestAssets({
      archive: withAssetNames(
        archive,
        JSON.stringify({ 'file-one.dat': 'first.jpg', 'file-two.dat': 'clip.xyz' }),
      ),
      layout,
      userId: 'u1',
      tenantId: undefined,
      source: 'local',
      pointers: ['file-service://file-one', 'file-service://file-two'],
      deps: {
        saveBuffer: async ({ fileName }) => `/uploads/u1/${fileName}`,
        createFile: async (data) => ({ file_id: data.file_id as string }),
      },
    });

    expect(result.map.get('file-service://file-one')?.type).toBe('image/jpeg');
    expect(result.map.get('file-service://file-two')?.type).toBe('application/octet-stream');

    archive.close();
  });
});
