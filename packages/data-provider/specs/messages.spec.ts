import { Constants } from '../src/config';
import { buildTree } from '../src/messages';

describe('buildTree', () => {
  it('links children when the assistant message appears before its parent in the list', () => {
    const userId = 'user-1';
    const assistantId = 'assistant-1';

    const tree = buildTree({
      messages: [
        {
          messageId: assistantId,
          parentMessageId: userId,
          isCreatedByUser: false,
          text: 'Answer',
        },
        {
          messageId: userId,
          parentMessageId: Constants.NO_PARENT,
          isCreatedByUser: true,
          text: 'Question',
        },
      ],
    });

    expect(tree).toHaveLength(1);
    expect(tree?.[0].messageId).toBe(userId);
    expect(tree?.[0].children).toHaveLength(1);
    expect(tree?.[0].children?.[0].messageId).toBe(assistantId);
  });

  it('heals orphan assistant roots under a lone user root', () => {
    const userId = 'user-1';
    const assistantId = 'assistant-1';

    const tree = buildTree({
      messages: [
        {
          messageId: assistantId,
          parentMessageId: Constants.NO_PARENT,
          isCreatedByUser: false,
          text: 'Answer',
        },
        {
          messageId: userId,
          parentMessageId: Constants.NO_PARENT,
          isCreatedByUser: true,
          text: 'Question',
        },
      ],
    });

    expect(tree).toHaveLength(1);
    expect(tree?.[0].messageId).toBe(userId);
    expect(tree?.[0].children).toHaveLength(1);
    expect(tree?.[0].children?.[0].messageId).toBe(assistantId);
  });
});
