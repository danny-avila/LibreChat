import type { TAttachment, TMessageContentParts } from 'librechat-data-provider';
import {
  collectToolCallIds,
  selectNestedAttachments,
  selectUnclaimedAttachments,
} from './attachments';

const file = (toolCallId?: string) =>
  ({ file_id: `file-${toolCallId}`, toolCallId }) as TAttachment;

const toolCall = (id: string, subagent_content?: TMessageContentParts[]) =>
  ({ type: 'tool_call', tool_call: { id, subagent_content } }) as unknown as TMessageContentParts;

describe('subagent attachments', () => {
  it('leaves files claimed by a top-level tool call to that part', () => {
    const content = [toolCall('subagent-call', [toolCall('child-call')]), toolCall('direct-call')];
    const unclaimed = selectUnclaimedAttachments(content, [
      file('direct-call'),
      file('child-call'),
      file('subagent-call'),
      file(undefined),
    ]);
    expect(unclaimed.map((attachment) => attachment.toolCallId)).toEqual(['child-call']);
  });

  it('keeps a file whose child id duplicates a top-level id on the top-level part', () => {
    const subagent = toolCall('subagent-call', [toolCall('shared-id')]);
    const unclaimed = selectUnclaimedAttachments(
      [subagent, toolCall('shared-id')],
      [file('shared-id')],
    );
    expect(selectNestedAttachments(unclaimed, collectToolCallIds([subagent]))).toEqual([]);
  });

  it('collects child ids through nested subagent runs', () => {
    const ids = collectToolCallIds([
      toolCall('subagent-call', [toolCall('child-call', [toolCall('grandchild-call')])]),
    ]);
    const nested = selectNestedAttachments([file('grandchild-call'), file('other')], ids);
    expect(nested.map((attachment) => attachment.toolCallId)).toEqual(['grandchild-call']);
  });
});
