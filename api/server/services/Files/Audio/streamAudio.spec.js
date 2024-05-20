const { Message } = require('~/models/Message');
const { createChunkProcessor } = require('./streamAudio');

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
    processChunks = createChunkProcessor();
    Message.findOne.mockClear();
    Message.findOne().lean.mockClear();
  });

  it('should return an empty array when the message is not found', async () => {
    Message.findOne().lean.mockResolvedValueOnce(null);

    const result = await processChunks('non-existent-id');

    expect(result).toEqual([]);
    expect(Message.findOne).toHaveBeenCalledWith(
      { messageId: 'non-existent-id' },
      'text unfinished',
    );
    expect(Message.findOne().lean).toHaveBeenCalled();
  });

  it('should return an empty array when the message does not have a text property', async () => {
    Message.findOne().lean.mockResolvedValueOnce({ unfinished: true });

    const result = await processChunks('message-id');

    expect(result).toEqual([]);
    expect(Message.findOne).toHaveBeenCalledWith({ messageId: 'message-id' }, 'text unfinished');
    expect(Message.findOne().lean).toHaveBeenCalled();
  });

  it('should return chunks for an unfinished message with separators', async () => {
    const messageText = 'This is a long message. It should be split into chunks. Lol hi mom';
    Message.findOne().lean.mockResolvedValueOnce({ text: messageText, unfinished: true });

    const result = await processChunks('message-id');

    expect(result).toEqual([
      { text: 'This is a long message. It should be split into chunks.', isFinished: false },
    ]);
    expect(Message.findOne).toHaveBeenCalledWith({ messageId: 'message-id' }, 'text unfinished');
    expect(Message.findOne().lean).toHaveBeenCalled();
  });

  it('should return chunks for an unfinished message without separators', async () => {
    const messageText = 'This is a long message without separators hello there my friend';
    Message.findOne().lean.mockResolvedValueOnce({ text: messageText, unfinished: true });

    const result = await processChunks('message-id');

    expect(result).toEqual([{ text: messageText, isFinished: false }]);
    expect(Message.findOne).toHaveBeenCalledWith({ messageId: 'message-id' }, 'text unfinished');
    expect(Message.findOne().lean).toHaveBeenCalled();
  });

  it('should return the remaining text as a chunk for a finished message', async () => {
    const messageText = 'This is a finished message.';
    Message.findOne().lean.mockResolvedValueOnce({ text: messageText, unfinished: false });

    const result = await processChunks('message-id');

    expect(result).toEqual([{ text: messageText, isFinished: true }]);
    expect(Message.findOne).toHaveBeenCalledWith({ messageId: 'message-id' }, 'text unfinished');
    expect(Message.findOne().lean).toHaveBeenCalled();
  });

  it('should return an empty array for a finished message with no remaining text', async () => {
    const messageText = 'This is a finished message.';
    Message.findOne().lean.mockResolvedValueOnce({ text: messageText, unfinished: false });

    await processChunks('message-id');
    Message.findOne().lean.mockResolvedValueOnce({ text: messageText, unfinished: false });
    const result = await processChunks('message-id');

    expect(result).toEqual([]);
    expect(Message.findOne).toHaveBeenCalledWith({ messageId: 'message-id' }, 'text unfinished');
    expect(Message.findOne().lean).toHaveBeenCalledTimes(2);
  });
});
