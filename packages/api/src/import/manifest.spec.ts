import type { ArchiveEntry } from './archive';
import { parseManifest, resolveLayout } from './manifest';

function entries(...names: string[]): ArchiveEntry[] {
  return names.map((name) => ({ name, bytes: 10 }));
}

describe('parseManifest', () => {
  it('reads version and sharded logical files', () => {
    const manifest = parseManifest(
      Buffer.from(
        JSON.stringify({
          version: 1,
          logical_files: {
            'conversations.json': {
              files: ['conversations-000.json', 'conversations-001.json'],
              sharded: true,
            },
          },
        }),
      ),
    );
    expect(manifest?.version).toBe(1);
    expect(manifest?.logical_files['conversations.json'].files).toHaveLength(2);
  });

  it('returns null on malformed JSON rather than throwing', () => {
    expect(parseManifest(Buffer.from('not json'))).toBeNull();
  });
});

describe('resolveLayout', () => {
  it('orders shards as the manifest declares them', () => {
    const layout = resolveLayout(
      entries('conversations-001.json', 'conversations-000.json', 'export_manifest.json'),
      {
        version: 1,
        logical_files: {
          'conversations.json': {
            files: ['conversations-000.json', 'conversations-001.json'],
            sharded: true,
          },
        },
      },
    );
    expect(layout.conversationShards).toEqual(['conversations-000.json', 'conversations-001.json']);
    expect(layout.version).toBe(1);
  });

  it('sorts shards naturally when there is no manifest', () => {
    const layout = resolveLayout(
      entries('conversations-010.json', 'conversations-002.json', 'conversations-001.json'),
      null,
    );
    expect(layout.conversationShards).toEqual([
      'conversations-001.json',
      'conversations-002.json',
      'conversations-010.json',
    ]);
  });

  it('prefers a single conversations.json when present', () => {
    const layout = resolveLayout(entries('conversations.json', 'user.json'), null);
    expect(layout.conversationShards).toEqual(['conversations.json']);
  });

  it('falls back to a lone json upload', () => {
    const layout = resolveLayout(entries('my-export.json'), null);
    expect(layout.conversationShards).toEqual(['my-export.json']);
  });

  it('ignores manifest shards that are absent from the archive', () => {
    const layout = resolveLayout(entries('conversations-000.json'), {
      version: 1,
      logical_files: {
        'conversations.json': {
          files: ['conversations-000.json', 'conversations-001.json'],
          sharded: true,
        },
      },
    });
    expect(layout.conversationShards).toEqual(['conversations-000.json']);
  });

  it('separates asset entries and the asset name map', () => {
    const layout = resolveLayout(
      entries(
        'conversations.json',
        'conversation_asset_file_names.json',
        'file-abc.dat',
        'file_000.dat',
      ),
      null,
    );
    expect(layout.assetNames).toBe('conversation_asset_file_names.json');
    expect(layout.assetEntries.map((entry) => entry.name)).toEqual([
      'file-abc.dat',
      'file_000.dat',
    ]);
  });
});
