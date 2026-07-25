import fs from 'fs';
import os from 'os';
import path from 'path';

import JSZip from 'jszip';

const CITE = '';

export const FIXTURE_ASSET_BYTES = 4;

const SHARD_ONE = [
  {
    conversation_id: 'ext-cited',
    title: 'Amalfi trip',
    create_time: 1700000000,
    update_time: 1700000100,
    default_model_slug: 'gpt-5-thinking',
    is_archived: true,
    is_starred: false,
    pinned_time: null,
    mapping: {
      root: { id: 'root', message: null, parent: null, children: ['u1'] },
      u1: {
        id: 'u1',
        parent: 'root',
        children: ['t1'],
        message: {
          id: 'u1',
          author: { role: 'user', name: null },
          create_time: 1700000001,
          content: { content_type: 'text', parts: ['Where should I stay?'] },
        },
      },
      t1: {
        id: 't1',
        parent: 'u1',
        children: ['a1'],
        message: {
          id: 't1',
          author: { role: 'assistant', name: null },
          create_time: 1700000002,
          content: {
            content_type: 'thoughts',
            thoughts: [{ content: 'Comparing towns', summary: 'Towns' }],
          },
        },
      },
      a1: {
        id: 'a1',
        parent: 't1',
        children: [],
        message: {
          id: 'a1',
          author: { role: 'assistant', name: null },
          create_time: 1700000003,
          content: {
            content_type: 'text',
            parts: [`Stay in Positano.${CITE}turn0search0`],
          },
          metadata: {
            model_slug: 'gpt-5-thinking',
            search_result_groups: [
              {
                domain: 'earthtrekkers.com',
                entries: [
                  {
                    title: 'Amalfi Coast Itinerary',
                    url: 'https://earthtrekkers.com/amalfi',
                    snippet: 'Plan your trip',
                    attributions: null,
                  },
                ],
              },
            ],
          },
        },
      },
    },
  },
];

const SHARD_TWO = [
  {
    conversation_id: 'ext-media',
    title: 'Photo review',
    create_time: 1700001000,
    update_time: 1700001100,
    default_model_slug: 'gpt-4o',
    is_archived: false,
    is_starred: true,
    pinned_time: null,
    mapping: {
      root: { id: 'root', message: null, parent: null, children: ['u1'] },
      u1: {
        id: 'u1',
        parent: 'root',
        children: ['u2'],
        message: {
          id: 'u1',
          author: { role: 'user', name: null },
          create_time: 1700001001,
          content: {
            content_type: 'multimodal_text',
            parts: [
              { content_type: 'image_asset_pointer', asset_pointer: 'file-service://file-one' },
              { content_type: 'image_asset_pointer', asset_pointer: 'file-service://file-two' },
              'compare these',
            ],
          },
          metadata: {
            attachments: [
              { id: 'file-one', name: 'first.jpg', mime_type: 'image/jpeg', size: 4 },
              { id: 'file-two', name: 'second.jpg', mime_type: 'image/jpeg', size: 4 },
            ],
          },
        },
      },
      u2: {
        id: 'u2',
        parent: 'u1',
        children: [],
        message: {
          id: 'u2',
          author: { role: 'user', name: null },
          create_time: 1700001002,
          content: {
            content_type: 'multimodal_text',
            parts: [
              { content_type: 'audio_transcription', text: 'Allora iniziamo', direction: 'out' },
              { content_type: 'audio_asset_pointer', asset_pointer: 'sediment://file_gone' },
            ],
          },
        },
      },
    },
  },
];

export interface FixtureOverrides {
  omitManifest?: boolean;
}

export async function buildFixtureExport(overrides: FixtureOverrides = {}): Promise<string> {
  const zip = new JSZip();

  zip.file('conversations-000.json', JSON.stringify(SHARD_ONE));
  zip.file('conversations-001.json', JSON.stringify(SHARD_TWO));
  zip.file(
    'conversation_asset_file_names.json',
    JSON.stringify({
      'file-one.dat': 'first.jpg',
      'file-two.dat': 'second.jpg',
      'file-three.dat': 'orphan.jpg',
    }),
  );
  zip.file('file-one.dat', Buffer.from([1, 2, 3, 4]));
  zip.file('file-two.dat', Buffer.from([5, 6, 7, 8]));
  zip.file('file-three.dat', Buffer.from([9, 9, 9, 9]));
  zip.file('user.json', JSON.stringify({ email: 'fixture@example.com' }));

  if (!overrides.omitManifest) {
    zip.file(
      'export_manifest.json',
      JSON.stringify({
        version: 1,
        manifest_file: 'export_manifest.json',
        logical_files: {
          'conversations.json': {
            files: ['conversations-000.json', 'conversations-001.json'],
            sharded: true,
          },
        },
      }),
    );
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-import-fixture-'));
  const filepath = path.join(dir, 'chatgpt-export.zip');
  fs.writeFileSync(filepath, buffer);
  return filepath;
}
