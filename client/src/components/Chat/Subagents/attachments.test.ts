import type { TAttachment, TMessageContentParts } from 'librechat-data-provider';
import {
  collectToolCallIds,
  assignNestedAttachments,
  selectUnclaimedAttachments,
} from './attachments';

const file = (toolCallId?: string) =>
  ({ file_id: `file-${toolCallId}`, toolCallId }) as TAttachment;

const toolCall = (id: string, fields: Record<string, unknown> = {}) =>
  ({ type: 'tool_call', tool_call: { id, ...fields } }) as unknown as TMessageContentParts;

const subagent = (id: string, subagent_content: TMessageContentParts[]) =>
  toolCall(id, { name: 'subagent', subagent_content });

const ids = (map: ReadonlyMap<string, TAttachment[]>, owner: string) =>
  (map.get(owner) ?? []).map((attachment) => attachment.toolCallId);

describe('subagent attachments', () => {
  it('leaves out files a top-level part accepted and files without a tool call', () => {
    const accepted = file('direct-call');
    const unclaimed = selectUnclaimedAttachments(
      [accepted, file('child-call'), file(undefined)],
      new Set([accepted]),
    );
    expect(unclaimed.map((attachment) => attachment.toolCallId)).toEqual(['child-call']);
  });

  it('offers a file its top-level part rejected to the subagent that ran it', () => {
    const rejected = file('shared-id');
    const unclaimed = selectUnclaimedAttachments([rejected], new Set());
    const content = [subagent('subagent-call', [toolCall('shared-id')]), toolCall('shared-id')];
    expect(ids(assignNestedAttachments(content, unclaimed, new Map()), 'subagent-call')).toEqual([
      'shared-id',
    ]);
  });

  it('collects child ids through nested runs and previewed transcripts', () => {
    expect(
      collectToolCallIds([
        subagent('subagent-call', [subagent('child-call', [toolCall('grandchild-call')])]),
        toolCall('previewed-call', { subagentAttachmentToolCallIds: ['omitted-call'] }),
      ]),
    ).toEqual(
      new Set(['subagent-call', 'child-call', 'grandchild-call', 'previewed-call', 'omitted-call']),
    );
  });

  it('routes previewed, live and stored child files, each to one owner', () => {
    const content = [
      subagent('first', [toolCall('shared-child')]),
      subagent('second', [toolCall('shared-child')]),
      toolCall('previewed', { name: 'subagent', subagentAttachmentToolCallIds: ['omitted'] }),
      toolCall('streaming', { name: 'subagent' }),
    ];
    const unclaimed = [file('shared-child'), file('omitted'), file('live-child'), file('other')];
    const assigned = assignNestedAttachments(
      content,
      unclaimed,
      new Map([['streaming', ['live-child']]]),
    );
    expect(ids(assigned, 'first')).toEqual(['shared-child']);
    expect(ids(assigned, 'second')).toEqual([]);
    expect(ids(assigned, 'previewed')).toEqual(['omitted']);
    expect(ids(assigned, 'streaming')).toEqual(['live-child']);
  });
});
