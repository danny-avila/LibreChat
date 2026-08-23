import { readResolvedConversationFiles } from './initialize';

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

  it('falls back to the database when the resolved document omits files or is another conversation', () => {
    expect(
      readResolvedConversationFiles(
        { resolvedConversation: { conversationId, agent_id: 'child-agent' } },
        conversationId,
      ),
    ).toBeUndefined();
    expect(
      readResolvedConversationFiles(
        { resolvedConversation: { conversationId: 'other', files: ['file-1'] } },
        conversationId,
      ),
    ).toBeUndefined();
  });
});
