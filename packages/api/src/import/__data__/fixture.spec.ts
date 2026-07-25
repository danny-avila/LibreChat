import { buildFixtureExport, cleanupFixtureExport } from './fixture';
import { parseManifest, resolveLayout } from '~/import/manifest';
import { openArchive } from '~/import/archive';

describe('buildFixtureExport', () => {
  afterEach(() => {
    cleanupFixtureExport();
  });

  it('produces a manifest-driven two-shard export with assets', async () => {
    const filepath = await buildFixtureExport();
    const archive = await openArchive(filepath);

    const manifest = parseManifest(await archive.read('export_manifest.json'));
    const layout = resolveLayout(archive.entries, manifest);

    expect(layout.version).toBe(1);
    expect(layout.conversationShards).toEqual(['conversations-000.json', 'conversations-001.json']);
    expect(layout.assetEntries).toHaveLength(3);
    expect(layout.assetNames).toBe('conversation_asset_file_names.json');

    archive.close();
  });

  it('omitManifest creates archive without manifest, shards discovered by filename', async () => {
    const filepath = await buildFixtureExport({ omitManifest: true });
    const archive = await openArchive(filepath);

    const hasManifest = archive.entries.some((e) => e.name === 'export_manifest.json');
    expect(hasManifest).toBe(false);

    const layout = resolveLayout(archive.entries, null);

    expect(layout.conversationShards).toEqual(['conversations-000.json', 'conversations-001.json']);
    expect(layout.assetEntries).toHaveLength(3);

    archive.close();
  });
});
