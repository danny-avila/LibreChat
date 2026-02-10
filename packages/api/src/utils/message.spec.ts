import { Constants } from 'librechat-data-provider';
import { sanitizeFileForTransmit, sanitizeMessageForTransmit, getThreadData } from './message';

/** Cast to string for type compatibility with ThreadMessage */
const NO_PARENT = Constants.NO_PARENT as string;

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

describe('getThreadData', () => {
  describe('edge cases - empty and null inputs', () => {
    it('should return empty result for empty messages array', () => {
      const result = getThreadData([], 'parent-123');

      expect(result.messageIds).toEqual([]);
      expect(result.fileIds).toEqual([]);
    });

    it('should return empty result for null parentMessageId', () => {
      const messages = [
        { messageId: 'msg-1', parentMessageId: null },
        { messageId: 'msg-2', parentMessageId: 'msg-1' },
      ];

      const result = getThreadData(messages, null);

      expect(result.messageIds).toEqual([]);
      expect(result.fileIds).toEqual([]);
    });

    it('should return empty result for undefined parentMessageId', () => {
      const messages = [{ messageId: 'msg-1', parentMessageId: null }];

      const result = getThreadData(messages, undefined);

      expect(result.messageIds).toEqual([]);
      expect(result.fileIds).toEqual([]);
    });

    it('should return empty result when parentMessageId not found in messages', () => {
      const messages = [
        { messageId: 'msg-1', parentMessageId: null },
        { messageId: 'msg-2', parentMessageId: 'msg-1' },
      ];

      const result = getThreadData(messages, 'non-existent');

      expect(result.messageIds).toEqual([]);
      expect(result.fileIds).toEqual([]);
    });
  });

  describe('thread traversal', () => {
    it('should traverse a simple linear thread', () => {
      const messages = [
        { messageId: 'msg-1', parentMessageId: NO_PARENT },
        { messageId: 'msg-2', parentMessageId: 'msg-1' },
        { messageId: 'msg-3', parentMessageId: 'msg-2' },
      ];

      const result = getThreadData(messages, 'msg-3');

      expect(result.messageIds).toEqual(['msg-3', 'msg-2', 'msg-1']);
      expect(result.fileIds).toEqual([]);
    });

    it('should stop at NO_PARENT constant', () => {
      const messages = [
        { messageId: 'msg-1', parentMessageId: NO_PARENT },
        { messageId: 'msg-2', parentMessageId: 'msg-1' },
      ];

      const result = getThreadData(messages, 'msg-2');

      expect(result.messageIds).toEqual(['msg-2', 'msg-1']);
    });

    it('should collect only messages in the thread branch', () => {
      // Branched conversation: msg-1 -> msg-2 -> msg-3 (branch A)
      //                       msg-1 -> msg-4 -> msg-5 (branch B)
      const messages = [
        { messageId: 'msg-1', parentMessageId: NO_PARENT },
        { messageId: 'msg-2', parentMessageId: 'msg-1' },
        { messageId: 'msg-3', parentMessageId: 'msg-2' },
        { messageId: 'msg-4', parentMessageId: 'msg-1' },
        { messageId: 'msg-5', parentMessageId: 'msg-4' },
      ];

      const resultBranchA = getThreadData(messages, 'msg-3');
      expect(resultBranchA.messageIds).toEqual(['msg-3', 'msg-2', 'msg-1']);

      const resultBranchB = getThreadData(messages, 'msg-5');
      expect(resultBranchB.messageIds).toEqual(['msg-5', 'msg-4', 'msg-1']);
    });

    it('should handle single message thread', () => {
      const messages = [{ messageId: 'msg-1', parentMessageId: NO_PARENT }];

      const result = getThreadData(messages, 'msg-1');

      expect(result.messageIds).toEqual(['msg-1']);
      expect(result.fileIds).toEqual([]);
    });
  });

  describe('circular reference protection', () => {
    it('should handle circular references without infinite loop', () => {
      // Malformed data: msg-2 points to msg-3 which points back to msg-2
      const messages = [
        { messageId: 'msg-1', parentMessageId: NO_PARENT },
        { messageId: 'msg-2', parentMessageId: 'msg-3' },
        { messageId: 'msg-3', parentMessageId: 'msg-2' },
      ];

      const result = getThreadData(messages, 'msg-2');

      // Should stop when encountering a visited ID
      expect(result.messageIds).toEqual(['msg-2', 'msg-3']);
      expect(result.fileIds).toEqual([]);
    });

    it('should handle self-referencing message', () => {
      const messages = [{ messageId: 'msg-1', parentMessageId: 'msg-1' }];

      const result = getThreadData(messages, 'msg-1');

      expect(result.messageIds).toEqual(['msg-1']);
    });
  });

  describe('file ID collection', () => {
    it('should collect file IDs from messages with files', () => {
      const messages = [
        {
          messageId: 'msg-1',
          parentMessageId: NO_PARENT,
          files: [{ file_id: 'file-1' }, { file_id: 'file-2' }],
        },
        {
          messageId: 'msg-2',
          parentMessageId: 'msg-1',
          files: [{ file_id: 'file-3' }],
        },
      ];

      const result = getThreadData(messages, 'msg-2');

      expect(result.messageIds).toEqual(['msg-2', 'msg-1']);
      expect(result.fileIds).toContain('file-1');
      expect(result.fileIds).toContain('file-2');
      expect(result.fileIds).toContain('file-3');
      expect(result.fileIds).toHaveLength(3);
    });

    it('should deduplicate file IDs across messages', () => {
      const messages = [
        {
          messageId: 'msg-1',
          parentMessageId: NO_PARENT,
          files: [{ file_id: 'file-shared' }, { file_id: 'file-1' }],
        },
        {
          messageId: 'msg-2',
          parentMessageId: 'msg-1',
          files: [{ file_id: 'file-shared' }, { file_id: 'file-2' }],
        },
      ];

      const result = getThreadData(messages, 'msg-2');

      expect(result.fileIds).toContain('file-shared');
      expect(result.fileIds).toContain('file-1');
      expect(result.fileIds).toContain('file-2');
      expect(result.fileIds).toHaveLength(3);
    });

    it('should skip files without file_id', () => {
      const messages = [
        {
          messageId: 'msg-1',
          parentMessageId: NO_PARENT,
          files: [{ file_id: 'file-1' }, { file_id: undefined }, { file_id: '' }],
        },
      ];

      const result = getThreadData(messages, 'msg-1');

      expect(result.fileIds).toEqual(['file-1']);
    });

    it('should handle messages with empty files array', () => {
      const messages = [
        {
          messageId: 'msg-1',
          parentMessageId: NO_PARENT,
          files: [],
        },
        {
          messageId: 'msg-2',
          parentMessageId: 'msg-1',
          files: [{ file_id: 'file-1' }],
        },
      ];

      const result = getThreadData(messages, 'msg-2');

      expect(result.messageIds).toEqual(['msg-2', 'msg-1']);
      expect(result.fileIds).toEqual(['file-1']);
    });

    it('should handle messages without files property', () => {
      const messages = [
        { messageId: 'msg-1', parentMessageId: NO_PARENT },
        {
          messageId: 'msg-2',
          parentMessageId: 'msg-1',
          files: [{ file_id: 'file-1' }],
        },
      ];

      const result = getThreadData(messages, 'msg-2');

      expect(result.messageIds).toEqual(['msg-2', 'msg-1']);
      expect(result.fileIds).toEqual(['file-1']);
    });

    it('should only collect files from messages in the thread', () => {
      // msg-3 is not in the thread from msg-2
      const messages = [
        {
          messageId: 'msg-1',
          parentMessageId: NO_PARENT,
          files: [{ file_id: 'file-1' }],
        },
        {
          messageId: 'msg-2',
          parentMessageId: 'msg-1',
          files: [{ file_id: 'file-2' }],
        },
        {
          messageId: 'msg-3',
          parentMessageId: 'msg-1',
          files: [{ file_id: 'file-3' }],
        },
      ];

      const result = getThreadData(messages, 'msg-2');

      expect(result.fileIds).toContain('file-1');
      expect(result.fileIds).toContain('file-2');
      expect(result.fileIds).not.toContain('file-3');
    });
  });

  describe('performance - O(1) lookups', () => {
    it('should handle large message arrays efficiently', () => {
      // Create a linear thread of 1000 messages
      const messages = [];
      for (let i = 0; i < 1000; i++) {
        messages.push({
          messageId: `msg-${i}`,
          parentMessageId: i === 0 ? NO_PARENT : `msg-${i - 1}`,
          files: [{ file_id: `file-${i}` }],
        });
      }

      const startTime = performance.now();
      const result = getThreadData(messages, 'msg-999');
      const endTime = performance.now();

      expect(result.messageIds).toHaveLength(1000);
      expect(result.fileIds).toHaveLength(1000);
      // Should complete in reasonable time (< 100ms for 1000 messages)
      expect(endTime - startTime).toBeLessThan(100);
    });
  });
});
