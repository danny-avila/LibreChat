const { Constants } = require('librechat-data-provider');
const { resolveAssistantParentMessageId } = require('./runJobStep');

describe('resolveAssistantParentMessageId', () => {
  it('keeps the user message as parent on the first step', () => {
    expect(
      resolveAssistantParentMessageId({
        stepIndex: 0,
        parentMessageId: Constants.NO_PARENT,
        responseParentMessageId: undefined,
        userMessageId: 'user-msg',
      }),
    ).toBe('user-msg');
  });

  it('chains later steps onto the previous assistant message', () => {
    expect(
      resolveAssistantParentMessageId({
        stepIndex: 1,
        parentMessageId: 'assistant-0',
        responseParentMessageId: 'ephemeral-user',
        userMessageId: 'ephemeral-user',
      }),
    ).toBe('assistant-0');
  });

  it('does not fall back to NO_PARENT when the first-step user id is known', () => {
    expect(
      resolveAssistantParentMessageId({
        stepIndex: 0,
        parentMessageId: Constants.NO_PARENT,
        responseParentMessageId: undefined,
        userMessageId: 'user-msg',
      }),
    ).not.toBe(Constants.NO_PARENT);
  });
});
