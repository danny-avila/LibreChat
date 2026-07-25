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

  it('returns null when logical_files entries have invalid files structure', () => {
    const manifest = parseManifest(
      Buffer.from(
        JSON.stringify({
          version: 1,
          logical_files: {
            'conversations.json': {
              files: 'nope',
              sharded: true,
            },
          },
        }),
      ),
    );
    expect(manifest).toBeNull();
  });

  it('returns null when logical_files entries contain non-string filenames', () => {
    const manifest = parseManifest(
      Buffer.from(
        JSON.stringify({
          version: 1,
          logical_files: {
            'conversations.json': {
              files: ['conversations-000.json', 123],
              sharded: true,
            },
          },
        }),
      ),
    );
    expect(manifest).toBeNull();
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

  it('sorts shards naturally when there is no manifest (zero-padded)', () => {
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

  it('sorts shards numerically, not lexicographically (unpadded)', () => {
    const layout = resolveLayout(
      entries('conversations-10.json', 'conversations-2.json', 'conversations-1.json'),
      null,
    );
    expect(layout.conversationShards).toEqual([
      'conversations-1.json',
      'conversations-2.json',
      'conversations-10.json',
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

  it('falls back to filename detection when manifest result is empty', () => {
    const layout = resolveLayout(
      entries('conversations-001.json', 'conversations-002.json', 'export_manifest.json'),
      {
        version: 1,
        logical_files: {
          'conversations.json': {
            files: ['conversations-000.json'],
            sharded: true,
          },
        },
      },
    );
    expect(layout.conversationShards).toEqual(['conversations-001.json', 'conversations-002.json']);
  });

  it('prefers conversations.json over sharded files when both are present', () => {
    const layout = resolveLayout(
      entries('conversations.json', 'conversations-000.json', 'conversations-001.json'),
      null,
    );
    expect(layout.conversationShards).toEqual(['conversations.json']);
  });

  it('does not trigger bare-json fallback when multiple json siblings are present', () => {
    const layout = resolveLayout(
      entries(
        'user.json',
        'shared_conversations.json',
        'message_feedback.json',
        'group_chats.json',
        'library_files.json',
      ),
      null,
    );
    expect(layout.conversationShards).toEqual([]);
  });

  it('falls back to filename detection when malformed manifest is passed', () => {
    const layout = resolveLayout(entries('conversations-001.json', 'conversations-002.json'), {
      version: 1,
      logical_files: {
        'conversations.json': {
          files: 'nope',
          sharded: true,
        } as unknown as { files: string[]; sharded: boolean },
      },
    });
    expect(layout.conversationShards).toEqual(['conversations-001.json', 'conversations-002.json']);
  });
});
