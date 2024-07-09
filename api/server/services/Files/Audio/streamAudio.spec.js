const { createChunkProcessor, splitTextIntoChunks } = require('./streamAudio');
const { Message } = require('~/models/Message');

jest.mock('~/models/Message', () => ({
  Message: {
    findOne: jest.fn().mockReturnValue({
      lean: jest.fn(),
    }),
  },
}));

describe('processChunks', () => {
  let processChunks;

  beforeEach(() => {
    processChunks = createChunkProcessor('message-id');
    Message.findOne.mockClear();
    Message.findOne().lean.mockClear();
  });

  it('should return an empty array when the message is not found', async () => {
    Message.findOne().lean.mockResolvedValueOnce(null);

    const result = await processChunks();

    expect(result).toEqual([]);
    expect(Message.findOne).toHaveBeenCalledWith({ messageId: 'message-id' }, 'text unfinished');
    expect(Message.findOne().lean).toHaveBeenCalled();
  });

  it('should return an empty array when the message does not have a text property', async () => {
    Message.findOne().lean.mockResolvedValueOnce({ unfinished: true });

    const result = await processChunks();

    expect(result).toEqual([]);
    expect(Message.findOne).toHaveBeenCalledWith({ messageId: 'message-id' }, 'text unfinished');
    expect(Message.findOne().lean).toHaveBeenCalled();
  });

  it('should return chunks for an unfinished message with separators', async () => {
    const messageText = 'This is a long message. It should be split into chunks. Lol hi mom';
    Message.findOne().lean.mockResolvedValueOnce({ text: messageText, unfinished: true });

    const result = await processChunks();

    expect(result).toEqual([
      { text: 'This is a long message. It should be split into chunks.', isFinished: false },
    ]);
    expect(Message.findOne).toHaveBeenCalledWith({ messageId: 'message-id' }, 'text unfinished');
    expect(Message.findOne().lean).toHaveBeenCalled();
  });

  it('should return chunks for an unfinished message without separators', async () => {
    const messageText = 'This is a long message without separators hello there my friend';
    Message.findOne().lean.mockResolvedValueOnce({ text: messageText, unfinished: true });

    const result = await processChunks();

    expect(result).toEqual([{ text: messageText, isFinished: false }]);
    expect(Message.findOne).toHaveBeenCalledWith({ messageId: 'message-id' }, 'text unfinished');
    expect(Message.findOne().lean).toHaveBeenCalled();
  });

  it('should return the remaining text as a chunk for a finished message', async () => {
    const messageText = 'This is a finished message.';
    Message.findOne().lean.mockResolvedValueOnce({ text: messageText, unfinished: false });

    const result = await processChunks();

    expect(result).toEqual([{ text: messageText, isFinished: true }]);
    expect(Message.findOne).toHaveBeenCalledWith({ messageId: 'message-id' }, 'text unfinished');
    expect(Message.findOne().lean).toHaveBeenCalled();
  });

  it('should return an empty array for a finished message with no remaining text', async () => {
    const messageText = 'This is a finished message.';
    Message.findOne().lean.mockResolvedValueOnce({ text: messageText, unfinished: false });

    await processChunks();
    Message.findOne().lean.mockResolvedValueOnce({ text: messageText, unfinished: false });
    const result = await processChunks();

    expect(result).toEqual([]);
    expect(Message.findOne).toHaveBeenCalledWith({ messageId: 'message-id' }, 'text unfinished');
    expect(Message.findOne().lean).toHaveBeenCalledTimes(2);
  });
});

describe('splitTextIntoChunks', () => {
  test('splits text into chunks of specified size with default separators', () => {
    const text = 'This is a test. This is only a test! Make sure it works properly? Okay.';
    const chunkSize = 20;
    const expectedChunks = [
      { text: 'This is a test.', isFinished: false },
      { text: 'This is only a test!', isFinished: false },
      { text: 'Make sure it works p', isFinished: false },
      { text: 'roperly? Okay.', isFinished: true },
    ];

    const result = splitTextIntoChunks(text, chunkSize);
    expect(result).toEqual(expectedChunks);
  });

  test('splits text into chunks with default size', () => {
    const text = 'A'.repeat(8000) + '. The end.';
    const expectedChunks = [
      { text: 'A'.repeat(4000), isFinished: false },
      { text: 'A'.repeat(4000), isFinished: false },
      { text: '. The end.', isFinished: true },
    ];

    const result = splitTextIntoChunks(text);
    expect(result).toEqual(expectedChunks);
  });

  test('returns a single chunk if text length is less than chunk size', () => {
    const text = 'Short text.';
    const expectedChunks = [{ text: 'Short text.', isFinished: true }];

    const result = splitTextIntoChunks(text, 4000);
    expect(result).toEqual(expectedChunks);
  });

  test('handles text with no separators correctly', () => {
    const text = 'ThisTextHasNoSeparatorsAndIsVeryLong'.repeat(100);
    const chunkSize = 4000;
    const expectedChunks = [{ text: text, isFinished: true }];

    const result = splitTextIntoChunks(text, chunkSize);
    expect(result).toEqual(expectedChunks);
  });

  test('throws an error when text is empty', () => {
    expect(() => splitTextIntoChunks('')).toThrow('Text is required');
  });
});
