const { formatMessage, formatLangChainMessages } = require('./formatMessages'); // Adjust the path accordingly
const { HumanMessage, AIMessage, SystemMessage } = require('langchain/schema');

describe('formatMessage', () => {
  it('formats user message', () => {
    const input = {
      message: {
        sender: 'user',
        text: 'Hello',
      },
      userName: 'John',
    };
    const result = formatMessage(input);
    expect(result).toEqual({
      role: 'user',
      content: 'Hello',
      name: 'John',
    });
  });

  it('formats a realistic user message', () => {
    const input = {
      message: {
        _id: '6512cdfb92cbf69fea615331',
        messageId: 'b620bf73-c5c3-4a38-b724-76886aac24c4',
        __v: 0,
        cancelled: false,
        conversationId: '5c23d24f-941f-4aab-85df-127b596c8aa5',
        createdAt: Date.now(),
        error: false,
        finish_reason: null,
        isCreatedByUser: true,
        isEdited: false,
        model: null,
        parentMessageId: '00000000-0000-0000-0000-000000000000',
        sender: 'User',
        text: 'hi',
        tokenCount: 5,
        unfinished: false,
        updatedAt: Date.now(),
        user: '6512cdf475f05c86d44c31d2',
      },
      userName: 'John',
    };
    const result = formatMessage(input);
    expect(result).toEqual({
      role: 'user',
      content: 'hi',
      name: 'John',
    });
  });

  it('formats assistant message', () => {
    const input = {
      message: {
        sender: 'assistant',
        text: 'Hi there',
      },
      assistantName: 'Assistant',
    };
    const result = formatMessage(input);
    expect(result).toEqual({
      role: 'assistant',
      content: 'Hi there',
      name: 'Assistant',
    });
  });

  it('formats system message', () => {
    const input = {
      message: {
        role: 'system',
        text: 'Hi there',
      },
    };
    const result = formatMessage(input);
    expect(result).toEqual({
      role: 'system',
      content: 'Hi there',
    });
  });

  it('formats user message with langChain', () => {
    const input = {
      message: {
        sender: 'user',
        text: 'Hello',
      },
      userName: 'John',
      langChain: true,
    };
    const result = formatMessage(input);
    expect(result).toBeInstanceOf(HumanMessage);
    expect(result.lc_kwargs.content).toEqual(input.message.text);
    expect(result.lc_kwargs.name).toEqual(input.userName);
  });

  it('formats assistant message with langChain', () => {
    const input = {
      message: {
        sender: 'assistant',
        text: 'Hi there',
      },
      assistantName: 'Assistant',
      langChain: true,
    };
    const result = formatMessage(input);
    expect(result).toBeInstanceOf(AIMessage);
    expect(result.lc_kwargs.content).toEqual(input.message.text);
    expect(result.lc_kwargs.name).toEqual(input.assistantName);
  });

  it('formats system message with langChain', () => {
    const input = {
      message: {
        role: 'system',
        text: 'This is a system message.',
      },
      langChain: true,
    };
    const result = formatMessage(input);
    expect(result).toBeInstanceOf(SystemMessage);
    expect(result.lc_kwargs.content).toEqual(input.message.text);
  });
});

describe('formatLangChainMessages', () => {
  it('formats an array of messages for LangChain', () => {
    const messages = [
      {
        role: 'system',
        content: 'This is a system message',
      },
      {
        sender: 'user',
        text: 'Hello',
      },
      {
        sender: 'assistant',
        text: 'Hi there',
      },
    ];
    const formatOptions = {
      userName: 'John',
      assistantName: 'Assistant',
    };
    const result = formatLangChainMessages(messages, formatOptions);
    expect(result).toHaveLength(3);
    expect(result[0]).toBeInstanceOf(SystemMessage);
    expect(result[1]).toBeInstanceOf(HumanMessage);
    expect(result[2]).toBeInstanceOf(AIMessage);

    expect(result[0].lc_kwargs.content).toEqual(messages[0].content);
    expect(result[1].lc_kwargs.content).toEqual(messages[1].text);
    expect(result[2].lc_kwargs.content).toEqual(messages[2].text);

    expect(result[1].lc_kwargs.name).toEqual(formatOptions.userName);
    expect(result[2].lc_kwargs.name).toEqual(formatOptions.assistantName);
  });
});
