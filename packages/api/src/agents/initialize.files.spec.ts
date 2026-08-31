import type { IConversation } from '@librechat/data-schemas';
import { readResolvedConversationFiles } from './initialize';
import { PARTIAL_RESOLVED_CONVERSATION } from './guard';

describe('readResolvedConversationFiles', () => {
  const conversationId = 'conversation-1';

  it('leaves the database read in place when no middleware resolved the conversation', () => {
    expect(readResolvedConversationFiles({}, conversationId)).toBeUndefined();
  });

  it('reports no files when the conversation was looked up and does not exist', () => {
    expect(readResolvedConversationFiles({ resolvedConversation: null }, conversationId)).toEqual(
      [],
    );
  });

  it('uses the resolved document when it carries the files field', () => {
    expect(
      readResolvedConversationFiles(
        { resolvedConversation: { conversationId, files: ['file-1'] } },
        conversationId,
      ),
    ).toEqual(['file-1']);
    expect(
      readResolvedConversationFiles(
        { resolvedConversation: { conversationId, files: [] } },
        conversationId,
      ),
    ).toEqual([]);
  });

  it('treats a stored document without files as having none', () => {
    expect(
      readResolvedConversationFiles(
        { resolvedConversation: { conversationId, title: 'no uploads yet' } },
        conversationId,
      ),
    ).toEqual([]);
  });

  it('falls back to the database for a branded lineage-only partial or another conversation', () => {
    const lineageOnly = {
      [PARTIAL_RESOLVED_CONVERSATION]: true,
      conversationId,
      agent_id: 'child-agent',
    } as unknown as IConversation;
    expect(
      readResolvedConversationFiles({ resolvedConversation: lineageOnly }, conversationId),
    ).toBeUndefined();
    expect(
      readResolvedConversationFiles(
        { resolvedConversation: { conversationId: 'other', files: ['file-1'] } },
        conversationId,
      ),
    ).toBeUndefined();
  });
});
