const addCacheControl = require('./addCacheControl');

describe('addCacheControl', () => {
  test('should add cache control to the last two user messages with array content', () => {
    const messages = [
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Hi there' }] },
      { role: 'user', content: [{ type: 'text', text: 'How are you?' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'I\'m doing well, thanks!' }] },
      { role: 'user', content: [{ type: 'text', text: 'Great!' }] },
    ];

    const result = addCacheControl(messages);

    expect(result[0].content[0]).not.toHaveProperty('cache_control');
    expect(result[2].content[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(result[4].content[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  test('should add cache control to the last two user messages with string content', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
      { role: 'user', content: 'How are you?' },
      { role: 'assistant', content: 'I\'m doing well, thanks!' },
      { role: 'user', content: 'Great!' },
    ];

    const result = addCacheControl(messages);

    expect(result[0].content).toBe('Hello');
    expect(result[2].content[0]).toEqual({
      type: 'text',
      text: 'How are you?',
      cache_control: { type: 'ephemeral' },
    });
    expect(result[4].content[0]).toEqual({
      type: 'text',
      text: 'Great!',
      cache_control: { type: 'ephemeral' },
    });
  });

  test('should handle mixed string and array content', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
      { role: 'user', content: [{ type: 'text', text: 'How are you?' }] },
    ];

    const result = addCacheControl(messages);

    expect(result[0].content[0]).toEqual({
      type: 'text',
      text: 'Hello',
      cache_control: { type: 'ephemeral' },
    });
    expect(result[2].content[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  test('should handle less than two user messages', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ];

    const result = addCacheControl(messages);

    expect(result[0].content[0]).toEqual({
      type: 'text',
      text: 'Hello',
      cache_control: { type: 'ephemeral' },
    });
    expect(result[1].content).toBe('Hi there');
  });

  test('should return original array if no user messages', () => {
    const messages = [
      { role: 'assistant', content: 'Hi there' },
      { role: 'assistant', content: 'How can I help?' },
    ];

    const result = addCacheControl(messages);

    expect(result).toEqual(messages);
  });

  test('should handle empty array', () => {
    const messages = [];
    const result = addCacheControl(messages);
    expect(result).toEqual([]);
  });

  test('should handle non-array input', () => {
    const messages = 'not an array';
    const result = addCacheControl(messages);
    expect(result).toBe('not an array');
  });

  test('should not modify assistant messages', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
      { role: 'user', content: 'How are you?' },
    ];

    const result = addCacheControl(messages);

    expect(result[1].content).toBe('Hi there');
  });

  test('should handle multiple content items in user messages', () => {
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'image', url: 'http://example.com/image.jpg' },
        ],
      },
      { role: 'assistant', content: 'Hi there' },
      { role: 'user', content: 'How are you?' },
    ];

    const result = addCacheControl(messages);

    expect(result[0].content[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(result[0].content[1].cache_control).toEqual({ type: 'ephemeral' });
    expect(result[2].content[0]).toEqual({
      type: 'text',
      text: 'How are you?',
      cache_control: { type: 'ephemeral' },
    });
  });

  test('should handle an array with mixed content types', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
      { role: 'user', content: [{ type: 'text', text: 'How are you?' }] },
      { role: 'assistant', content: 'I\'m doing well, thanks!' },
      { role: 'user', content: 'Great!' },
    ];

    const result = addCacheControl(messages);
    console.dir(result, { depth: null });

    expect(result[0].content).toEqual('Hello');
    expect(result[2].content[0]).toEqual({
      type: 'text',
      text: 'How are you?',
      cache_control: { type: 'ephemeral' },
    });
    expect(result[4].content).toEqual([
      {
        type: 'text',
        text: 'Great!',
        cache_control: { type: 'ephemeral' },
      },
    ]);
    expect(result[1].content).toBe('Hi there');
    expect(result[3].content).toBe('I\'m doing well, thanks!');
  });
});
