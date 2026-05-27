import { FileSources } from 'librechat-data-provider';
import type { IMongoFile } from '@librechat/data-schemas';
import type { ServerRequest } from '~/types';
import {
  collectFileIds,
  buildAgentScopedContext,
  getAgentContextAttachments,
  buildAgentContextAttachmentsByAgentId,
} from './attachments';

const makeTextFile = (file_id: string, filename: string, text: string): IMongoFile =>
  ({
    file_id,
    filename,
    text,
    source: FileSources.text,
  }) as IMongoFile;

describe('agent attachment helpers', () => {
  it('collects file ids from attachment-like files', () => {
    const fileIds = collectFileIds([
      { file_id: 'file-1' },
      null,
      { file_id: '' },
      { file_id: 'file-2' },
      { file_id: 'file-1' },
    ]);

    expect(Array.from(fileIds)).toEqual(['file-1', 'file-2']);
  });

  it('builds an agent context attachment map from initialized configs', () => {
    const file = makeTextFile('context-file', 'context.txt', 'context');
    const attachmentsByAgentId = buildAgentContextAttachmentsByAgentId([
      { id: 'agent-a', agentContextAttachments: [file] },
      { id: 'agent-b', agentContextAttachments: [] },
      { id: null, agentContextAttachments: [file] },
      undefined,
    ]);

    expect(attachmentsByAgentId.size).toBe(1);
    expect(attachmentsByAgentId.get('agent-a')).toEqual([file]);
  });

  it('filters shared request files out of scoped context attachments', () => {
    const shared = makeTextFile('shared-file', 'shared.txt', 'shared');
    const scoped = makeTextFile('scoped-file', 'scoped.txt', 'scoped');

    const attachments = getAgentContextAttachments({
      agentId: 'agent-a',
      attachmentsByAgentId: new Map([['agent-a', [shared, scoped]]]),
      excludeFileIds: new Set(['shared-file']),
    });

    expect(attachments).toEqual([scoped]);
  });

  it('builds scoped context only from non-shared context documents', async () => {
    const shared = makeTextFile('shared-file', 'shared.txt', 'Shared duplicate context');
    const scoped = makeTextFile('scoped-file', 'scoped.txt', 'Scoped private context');
    const req = {
      body: { fileTokenLimit: 1000 },
      config: {},
    } as ServerRequest;

    const scopedContext = await buildAgentScopedContext({
      agentIds: ['agent-a', 'agent-b'],
      attachmentsByAgentId: new Map([
        ['agent-a', [shared, scoped]],
        ['agent-b', [shared]],
      ]),
      sharedRunAttachmentIds: new Set(['shared-file']),
      req,
      tokenCountFn: (text) => text.length,
    });

    expect(scopedContext.get('agent-a')).toContain('Scoped private context');
    expect(scopedContext.get('agent-a')).not.toContain('Shared duplicate context');
    expect(scopedContext.has('agent-b')).toBe(false);
  });
});
