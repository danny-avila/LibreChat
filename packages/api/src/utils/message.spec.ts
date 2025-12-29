import { sanitizeFileForTransmit, sanitizeMessageForTransmit } from './message';

describe('sanitizeFileForTransmit', () => {
  it('should remove text field from file', () => {
    const file = {
      file_id: 'test-123',
      filename: 'test.txt',
      text: 'This is a very long text content that should be stripped',
      bytes: 1000,
    };

    const result = sanitizeFileForTransmit(file);

    expect(result.file_id).toBe('test-123');
    expect(result.filename).toBe('test.txt');
    expect(result.bytes).toBe(1000);
    expect(result).not.toHaveProperty('text');
  });

  it('should remove _id and __v fields', () => {
    const file = {
      file_id: 'test-123',
      _id: 'mongo-id',
      __v: 0,
      filename: 'test.txt',
    };

    const result = sanitizeFileForTransmit(file);

    expect(result.file_id).toBe('test-123');
    expect(result).not.toHaveProperty('_id');
    expect(result).not.toHaveProperty('__v');
  });

  it('should not modify original file object', () => {
    const file = {
      file_id: 'test-123',
      text: 'original text',
    };

    sanitizeFileForTransmit(file);

    expect(file.text).toBe('original text');
  });
});

describe('sanitizeMessageForTransmit', () => {
  it('should remove fileContext from message', () => {
    const message = {
      messageId: 'msg-123',
      text: 'Hello world',
      fileContext: 'This is a very long context that should be stripped',
    };

    const result = sanitizeMessageForTransmit(message);

    expect(result.messageId).toBe('msg-123');
    expect(result.text).toBe('Hello world');
    expect(result).not.toHaveProperty('fileContext');
  });

  it('should sanitize files array', () => {
    const message = {
      messageId: 'msg-123',
      files: [
        { file_id: 'file-1', text: 'long text 1', filename: 'a.txt' },
        { file_id: 'file-2', text: 'long text 2', filename: 'b.txt' },
      ],
    };

    const result = sanitizeMessageForTransmit(message);

    expect(result.files).toHaveLength(2);
    expect(result.files?.[0].file_id).toBe('file-1');
    expect(result.files?.[0].filename).toBe('a.txt');
    expect(result.files?.[0]).not.toHaveProperty('text');
    expect(result.files?.[1]).not.toHaveProperty('text');
  });

  it('should handle null/undefined message', () => {
    expect(sanitizeMessageForTransmit(null as unknown as object)).toBeNull();
    expect(sanitizeMessageForTransmit(undefined as unknown as object)).toBeUndefined();
  });

  it('should handle message without files', () => {
    const message = {
      messageId: 'msg-123',
      text: 'Hello',
    };

    const result = sanitizeMessageForTransmit(message);

    expect(result.messageId).toBe('msg-123');
    expect(result.text).toBe('Hello');
  });

  it('should create new array reference for empty files array (immutability)', () => {
    const message = {
      messageId: 'msg-123',
      files: [] as { file_id: string }[],
    };

    const result = sanitizeMessageForTransmit(message);

    expect(result.files).toEqual([]);
    // New array reference ensures full immutability even for empty arrays
    expect(result.files).not.toBe(message.files);
  });

  it('should not modify original message object', () => {
    const message = {
      messageId: 'msg-123',
      fileContext: 'original context',
      files: [{ file_id: 'file-1', text: 'original text' }],
    };

    sanitizeMessageForTransmit(message);

    expect(message.fileContext).toBe('original context');
    expect(message.files[0].text).toBe('original text');
  });
});
