const { formatMessage, formatLangChainMessages } = require('./formatMessage'); // Adjust the path accordingly
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
  });
});
