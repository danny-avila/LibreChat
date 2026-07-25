import { parseManifest, resolveLayout } from '~/import/manifest';
import { openArchive } from '~/import/archive';
import { buildFixtureExport } from './fixture';

describe('buildFixtureExport', () => {
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
});
