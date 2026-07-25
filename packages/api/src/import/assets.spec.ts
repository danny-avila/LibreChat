import { buildFixtureExport, cleanupFixtureExport } from './__data__/fixture';
import { parseManifest, resolveLayout } from './manifest';
import { pointerToEntry, ingestAssets } from './assets';
import { openArchive } from './archive';

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
    expect(result.errors[0]).toContain('quota exceeded');

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
});
