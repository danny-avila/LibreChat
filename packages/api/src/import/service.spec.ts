import fs from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';

import type { SaveMessageDetails, ConversationOverrides } from './service';

import { buildFixtureExport, cleanupFixtureExport } from './__data__/fixture';
import * as archiveModule from './archive';
import { runImport } from './service';

interface Recorded {
  conversations: Array<{ title: string; convo: ConversationOverrides; model: string }>;
  messages: SaveMessageDetails[];
}

function recorder(): { sink: Parameters<typeof runImport>[0]['batch']; recorded: Recorded } {
  const recorded: Recorded = { conversations: [], messages: [] };
  return {
    recorded,
    sink: {
      startConversation: () => undefined,
      saveMessage: (details) => {
        recorded.messages.push(details);
      },
      finishConversation: (title, _createdAt, convo, model) => {
        recorded.conversations.push({ title, convo, model });
      },
      maybeFlush: async () => undefined,
      saveBatch: async () => undefined,
    },
  };
}

const DEPS = {
  saveBuffer: async ({ fileName }: { fileName: string }) => `/uploads/u1/${fileName}`,
  createFile: async (data: { file_id: string }) => ({ file_id: data.file_id }),
};

const createdDirs: string[] = [];

async function writeZip(files: Record<string, string>): Promise<string> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) {
    zip.file(name, content);
  }
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-import-service-'));
  createdDirs.push(dir);
  const filepath = path.join(dir, 'export.zip');
  fs.writeFileSync(filepath, buffer);
  return filepath;
}

function shardedManifest(files: string[]): string {
  return JSON.stringify({
    version: 1,
    logical_files: { 'conversations.json': { files, sharded: true } },
  });
}

function textConversation(id: string, title: string, createTime: number): object {
  return {
    conversation_id: id,
    title,
    create_time: createTime,
    update_time: createTime + 100,
    default_model_slug: 'gpt-4o',
    is_archived: false,
    is_starred: false,
    pinned_time: null,
    mapping: {
      root: { id: 'root', message: null, parent: null, children: ['u1'] },
      u1: {
        id: 'u1',
        parent: 'root',
        children: [],
        message: {
          id: 'u1',
          author: { role: 'user', name: null },
          create_time: createTime + 1,
          content: { content_type: 'text', parts: ['Hello there'] },
        },
      },
    },
  };
}

describe('runImport', () => {
  afterEach(() => {
    cleanupFixtureExport();
    while (createdDirs.length > 0) {
      const dir = createdDirs.pop();
      if (dir) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('imports every shard with state, citations, and assets', async () => {
    const filepath = await buildFixtureExport();
    const { sink, recorded } = recorder();

    const report = await runImport({
      filepath,
      userId: 'u1',
      source: 'local',
      defaultModel: 'gpt-4o',
      deps: DEPS,
      batch: sink,
      existingExternalIds: new Set(),
    });

    expect(report.imported).toBe(2);
    expect(report.skipped).toBe(0);
    expect(report.assetsImported).toBe(2);
    expect(report.assetsUnavailable).toBe(1);
    expect(report.errors).toEqual([]);

    const archived = recorded.conversations.find((entry) => entry.title === 'Amalfi trip');
    expect(archived?.convo.isArchived).toBe(true);
    expect(archived?.convo.importedFrom).toEqual({ source: 'chatgpt', externalId: 'ext-cited' });

    const pinned = recorded.conversations.find((entry) => entry.title === 'Photo review');
    expect(pinned?.convo.pinned).toBe(true);

    const cited = recorded.messages.find((message) =>
      String(message.text).startsWith('Stay in Positano'),
    );
    expect(cited?.attachments).toHaveLength(1);
  });

  it('carries width, height, and filename from attachment metadata through to message.files', async () => {
    const filepath = await buildFixtureExport();
    const { sink, recorded } = recorder();

    await runImport({
      filepath,
      userId: 'u1',
      source: 'local',
      defaultModel: 'gpt-4o',
      deps: DEPS,
      batch: sink,
      existingExternalIds: new Set(),
    });

    const withPhotos = recorded.messages.find((message) => message.text === 'compare these');
    expect(withPhotos?.files).toHaveLength(2);
    expect(withPhotos?.files?.[0]).toMatchObject({
      filename: 'first.jpg',
      width: 768,
      height: 1560,
    });
    expect(withPhotos?.files?.[1]).toMatchObject({
      filename: 'second.jpg',
      width: 1080,
      height: 2340,
    });
  });

  it('skips conversations already imported from the same export', async () => {
    const filepath = await buildFixtureExport();
    const { sink, recorded } = recorder();

    const report = await runImport({
      filepath,
      userId: 'u1',
      source: 'local',
      defaultModel: 'gpt-4o',
      deps: DEPS,
      batch: sink,
      existingExternalIds: new Set(['ext-cited']),
    });

    expect(report.imported).toBe(1);
    expect(report.skipped).toBe(1);
    expect(recorded.conversations).toHaveLength(1);
  });

  it('reports progress as it advances', async () => {
    const filepath = await buildFixtureExport();
    const { sink } = recorder();
    const seen: number[] = [];

    await runImport({
      filepath,
      userId: 'u1',
      source: 'local',
      defaultModel: 'gpt-4o',
      deps: DEPS,
      batch: sink,
      existingExternalIds: new Set(),
      onProgress: async (progress) => {
        seen.push(progress.conversations.done);
      },
    });

    expect(seen[seen.length - 1]).toBe(2);
  });

  it('stops early when cancelled', async () => {
    const filepath = await buildFixtureExport();
    const { sink, recorded } = recorder();

    const report = await runImport({
      filepath,
      userId: 'u1',
      source: 'local',
      defaultModel: 'gpt-4o',
      deps: DEPS,
      batch: sink,
      existingExternalIds: new Set(),
      isCancelled: async () => true,
    });

    expect(recorded.conversations).toHaveLength(0);
    expect(report.imported).toBe(0);
  });

  it('stops before the next conversation once cancellation is observed mid-run', async () => {
    const filepath = await writeZip({
      'conversations-000.json': JSON.stringify([
        textConversation('ext-first', 'First convo', 1700005000),
        textConversation('ext-second', 'Second convo', 1700006000),
      ]),
      'export_manifest.json': shardedManifest(['conversations-000.json']),
    });
    const { sink, recorded } = recorder();
    let checks = 0;

    const report = await runImport({
      filepath,
      userId: 'u1',
      source: 'local',
      defaultModel: 'gpt-4o',
      deps: DEPS,
      batch: sink,
      existingExternalIds: new Set(),
      isCancelled: async () => {
        checks += 1;
        return checks > 1;
      },
    });

    expect(recorded.conversations).toHaveLength(1);
    expect(report.imported).toBe(1);
    expect(report.skipped).toBe(0);
  });

  it('records a shard parse failure and still imports the other shard', async () => {
    const filepath = await writeZip({
      'conversations-000.json': 'not valid json{',
      'conversations-001.json': JSON.stringify([
        textConversation('ext-good', 'Good convo', 1700002000),
      ]),
      'export_manifest.json': shardedManifest(['conversations-000.json', 'conversations-001.json']),
    });

    const { sink, recorded } = recorder();
    const report = await runImport({
      filepath,
      userId: 'u1',
      source: 'local',
      defaultModel: 'gpt-4o',
      deps: DEPS,
      batch: sink,
      existingExternalIds: new Set(),
    });

    expect(report.imported).toBe(1);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toContain('conversations-000.json');
    expect(recorded.conversations).toHaveLength(1);
    expect(recorded.conversations[0].title).toBe('Good convo');
  });

  it('records a shard that parses but is not an array and still imports the other shard', async () => {
    const filepath = await writeZip({
      'conversations-000.json': JSON.stringify({ not: 'an array' }),
      'conversations-001.json': JSON.stringify([
        textConversation('ext-good3', 'Good convo three', 1700007000),
      ]),
      'export_manifest.json': shardedManifest(['conversations-000.json', 'conversations-001.json']),
    });

    const { sink, recorded } = recorder();
    const report = await runImport({
      filepath,
      userId: 'u1',
      source: 'local',
      defaultModel: 'gpt-4o',
      deps: DEPS,
      batch: sink,
      existingExternalIds: new Set(),
    });

    expect(report.imported).toBe(1);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toContain('conversations-000.json');
    expect(report.errors[0]).toContain('expected an array');
    expect(recorded.conversations).toHaveLength(1);
    expect(recorded.conversations[0].title).toBe('Good convo three');
  });

  it('records a conversation that fails to convert and still imports the others', async () => {
    const good = textConversation('ext-good2', 'Good convo two', 1700003000);
    const broken = {
      conversation_id: 'ext-broken',
      title: 'Broken convo',
      create_time: 1700004000,
      update_time: 1700004100,
      default_model_slug: 'gpt-4o',
      is_archived: false,
      is_starred: false,
      pinned_time: null,
      mapping: {
        root: { id: 'root', message: null, parent: null, children: ['bad'] },
        bad: {
          id: 'bad',
          parent: 'root',
          children: [],
          message: {
            id: 'bad',
            author: null,
            create_time: 1700004001,
            content: { content_type: 'text', parts: ['oops'] },
          },
        },
      },
    };

    const filepath = await writeZip({
      'conversations-000.json': JSON.stringify([good, broken]),
      'export_manifest.json': shardedManifest(['conversations-000.json']),
    });

    const { sink, recorded } = recorder();
    const report = await runImport({
      filepath,
      userId: 'u1',
      source: 'local',
      defaultModel: 'gpt-4o',
      deps: DEPS,
      batch: sink,
      existingExternalIds: new Set(),
    });

    expect(report.imported).toBe(1);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toContain('ext-broken');
    expect(recorded.conversations).toHaveLength(1);
    expect(recorded.conversations[0].title).toBe('Good convo two');
  });

  it('counts asset errors separately from conversation errors and keeps every conversation', async () => {
    const filepath = await buildFixtureExport();
    const { sink, recorded } = recorder();
    let saveCalls = 0;

    const report = await runImport({
      filepath,
      userId: 'u1',
      source: 'local',
      defaultModel: 'gpt-4o',
      deps: {
        saveBuffer: async ({ fileName }: { fileName: string }) => {
          saveCalls += 1;
          if (saveCalls === 1) {
            throw new Error('quota exceeded');
          }
          return `/uploads/u1/${fileName}`;
        },
        createFile: async (data: { file_id: string }) => ({ file_id: data.file_id }),
      },
      batch: sink,
      existingExternalIds: new Set(),
    });

    expect(report.imported).toBe(2);
    expect(report.assetsImported).toBe(1);
    expect(report.assetsUnavailable).toBe(1);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toContain('quota exceeded');
    expect(recorded.conversations).toHaveLength(2);
  });

  it('closes the archive and rethrows when the final batch save fails', async () => {
    const filepath = await buildFixtureExport();
    const { sink } = recorder();
    sink.saveBatch = async () => {
      throw new Error('db down');
    };

    let closed = false;
    const realOpenArchive = archiveModule.openArchive;
    jest.spyOn(archiveModule, 'openArchive').mockImplementationOnce(async (path, options) => {
      const archive = await realOpenArchive(path, options);
      return {
        ...archive,
        close: () => {
          closed = true;
          archive.close();
        },
      };
    });

    await expect(
      runImport({
        filepath,
        userId: 'u1',
        source: 'local',
        defaultModel: 'gpt-4o',
        deps: DEPS,
        batch: sink,
        existingExternalIds: new Set(),
      }),
    ).rejects.toThrow('db down');

    expect(closed).toBe(true);
  });
});
