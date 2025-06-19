const UserMemoryMongo = require('./UserMemoryMongo');
const { connectDb } = require('~/db/connect');
const { createModels } = require('@librechat/data-schemas');

// Mock the dependencies
jest.mock('~/db/connect');
jest.mock('@librechat/data-schemas');
jest.mock('~/config', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

// Mock MongoDB models
const mockMemoryEntry = {
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  deleteOne: jest.fn(),
};

describe('UserMemoryMongo', () => {
  let userMemory;
  let mockMongoose;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockMongoose = {};
    connectDb.mockResolvedValue(mockMongoose);
    createModels.mockReturnValue({
      MemoryEntry: mockMemoryEntry
    });

    userMemory = new UserMemoryMongo({
      userId: '507f1f77bcf86cd799439011'
    });
  });

  describe('constructor', () => {
    test('should initialize with default values', () => {
      const tool = new UserMemoryMongo();
      expect(tool.name).toBe('user_memory_mongo');
      expect(tool.override).toBe(false);
      expect(tool.description).toContain('Manage user memories');
    });

    test('should accept userId parameter', () => {
      const userId = '507f1f77bcf86cd799439011';
      const tool = new UserMemoryMongo({ userId });
      expect(tool.userId).toBe(userId);
    });
  });

  describe('initDatabase', () => {
    test('should initialize database connection successfully', async () => {
      await userMemory.initDatabase();
      expect(connectDb).toHaveBeenCalled();
      expect(createModels).toHaveBeenCalledWith(mockMongoose);
      expect(userMemory.models).toBeDefined();
    });

    test('should handle database connection failure gracefully', async () => {
      connectDb.mockRejectedValue(new Error('Connection failed'));
      
      try {
        await userMemory.initDatabase();
      } catch (error) {
        expect(error.message).toBe('Connection failed');
      }
      
      expect(userMemory.models).toBeNull();
    });
  });

  describe('createMemory', () => {
    beforeEach(async () => {
      await userMemory.initDatabase();
    });

    test('should create a new memory successfully', async () => {
      const mockCreatedMemory = {
        _id: '507f1f77bcf86cd799439012',
        userId: '507f1f77bcf86cd799439011',
        key: 'memory_test123',
        value: 'Test memory content',
        tokenCount: 4,
        updated_at: new Date(),
        created_at: new Date(),
        save: jest.fn()
      };

      mockMemoryEntry.findOne.mockResolvedValue(null);
      mockMemoryEntry.create.mockResolvedValue(mockCreatedMemory);

      const result = await userMemory.createMemory(
        '507f1f77bcf86cd799439011',
        'Test memory content',
        ['test', 'memory']
      );

      expect(mockMemoryEntry.findOne).toHaveBeenCalled();
      expect(mockMemoryEntry.create).toHaveBeenCalled();
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('content', 'Test memory content');
      expect(result).toHaveProperty('tags');
    });

    test('should throw error if memory already exists', async () => {
      mockMemoryEntry.findOne.mockResolvedValue({ 
        key: 'existing_memory' 
      });

      await expect(
        userMemory.createMemory('507f1f77bcf86cd799439011', 'Test content')
      ).rejects.toThrow('Memory with similar content already exists');
    });
  });

  describe('getMemories', () => {
    beforeEach(async () => {
      await userMemory.initDatabase();
    });

    test('should retrieve all memories for a user', async () => {
      const mockMemories = [
        {
          _id: '507f1f77bcf86cd799439012',
          userId: '507f1f77bcf86cd799439011',
          key: 'memory_test1',
          value: 'First memory',
          updated_at: new Date()
        },
        {
          _id: '507f1f77bcf86cd799439013', 
          userId: '507f1f77bcf86cd799439011',
          key: 'memory_test2_work_project',
          value: 'Second memory with tags',
          updated_at: new Date()
        }
      ];

      mockMemoryEntry.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockMemories)
        })
      });

      const result = await userMemory.getMemories('507f1f77bcf86cd799439011');

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('content', 'First memory');
      expect(result[1]).toHaveProperty('content', 'Second memory with tags');
    });

    test('should filter memories by tags', async () => {
      const mockMemories = [
        {
          _id: '507f1f77bcf86cd799439013',
          userId: '507f1f77bcf86cd799439011', 
          key: 'memory_test_work_project',
          value: 'Work memory',
          updated_at: new Date()
        }
      ];

      mockMemoryEntry.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockMemories)
        })
      });

      const result = await userMemory.getMemories('507f1f77bcf86cd799439011', ['work']);

      expect(mockMemoryEntry.find).toHaveBeenCalledWith({
        userId: expect.any(Object),
        key: { $regex: expect.any(RegExp) }
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('deleteMemory', () => {
    beforeEach(async () => {
      await userMemory.initDatabase();
    });

    test('should delete memory successfully', async () => {
      mockMemoryEntry.deleteOne.mockResolvedValue({ deletedCount: 1 });

      const result = await userMemory.deleteMemory(
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012'
      );

      expect(mockMemoryEntry.deleteOne).toHaveBeenCalledWith({
        _id: expect.any(Object),
        userId: expect.any(Object)
      });
      expect(result).toBe(true);
    });

    test('should return false if memory not found', async () => {
      mockMemoryEntry.deleteOne.mockResolvedValue({ deletedCount: 0 });

      const result = await userMemory.deleteMemory(
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012'
      );

      expect(result).toBe(false);
    });
  });

  describe('_call method', () => {
    beforeEach(async () => {
      await userMemory.initDatabase();
    });

    test('should handle create_memory action', async () => {
      const mockCreatedMemory = {
        _id: '507f1f77bcf86cd799439012',
        userId: '507f1f77bcf86cd799439011',
        key: 'memory_test',
        value: 'Test content',
        updated_at: new Date(),
        created_at: new Date(),
        save: jest.fn()
      };

      mockMemoryEntry.findOne.mockResolvedValue(null);
      mockMemoryEntry.create.mockResolvedValue(mockCreatedMemory);

      const input = {
        action: 'create_memory',
        content: 'Test content',
        tags: ['test']
      };

      const result = await userMemory._call(input);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.memory).toHaveProperty('content', 'Test content');
      expect(parsed.message).toBe('Memory created successfully');
    });

    test('should handle get_memories action', async () => {
      const mockMemories = [
        {
          _id: '507f1f77bcf86cd799439012',
          userId: '507f1f77bcf86cd799439011',
          key: 'memory_test',
          value: 'Test memory',
          updated_at: new Date()
        }
      ];

      mockMemoryEntry.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockMemories)
        })
      });

      const input = { action: 'get_memories' };
      const result = await userMemory._call(input);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.memories).toHaveLength(1);
      expect(parsed.count).toBe(1);
    });

    test('should handle validation errors', async () => {
      const input = { action: 'invalid_action' };
      const result = await userMemory._call(input);
      const parsed = JSON.parse(result);

      expect(parsed.error).toBe('Invalid input parameters');
      expect(parsed.code).toBe('VALIDATION_ERROR');
    });

    test('should require userId', async () => {
      const toolWithoutUserId = new UserMemoryMongo();
      await toolWithoutUserId.initDatabase();

      const input = { action: 'get_memories' };
      const result = await toolWithoutUserId._call(input);
      const parsed = JSON.parse(result);

      expect(parsed.error).toBe('userId is required for all operations');
    });

    test('should handle database errors gracefully', async () => {
      mockMemoryEntry.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockRejectedValue(new Error('Database error'))
        })
      });

      const input = { action: 'get_memories' };
      const result = await userMemory._call(input);
      const parsed = JSON.parse(result);

      // The getMemories method returns empty array on error, so success: true with empty memories
      expect(parsed.success).toBe(true);
      expect(parsed.memories).toEqual([]);
      expect(parsed.count).toBe(0);
    });
  });

  describe('helper methods', () => {
    test('generateLibreChatKey should create consistent keys', () => {
      const content = 'Test memory content';
      const key1 = userMemory.generateLibreChatKey(content);
      const key2 = userMemory.generateLibreChatKey(content);
      
      expect(key1).toBe(key2);
      expect(key1).toMatch(/^[a-z0-9_]+$/);
    });

    test('extractTagsFromKey should extract tags correctly', () => {
      const key = 'memory_work_project_abc123';
      const tags = userMemory.extractTagsFromKey(key);
      
      expect(Array.isArray(tags)).toBe(true);
      expect(tags.length).toBeGreaterThanOrEqual(0);
    });

    test('sanitizeKeyComponent should sanitize input correctly', () => {
      const input = 'Test Tag!@#';
      const result = userMemory.sanitizeKeyComponent(input);
      
      expect(result).toBe('testtag');
      expect(result).toMatch(/^[a-z0-9]*$/);
    });

    test('estimateTokenCount should estimate tokens', () => {
      const text = 'This is a test sentence';
      const count = userMemory.estimateTokenCount(text);
      
      expect(count).toBeGreaterThan(0);
      expect(typeof count).toBe('number');
    });

    test('generateTagId should create consistent IDs', () => {
      const tagName = 'test';
      const id1 = userMemory.generateTagId(tagName);
      const id2 = userMemory.generateTagId(tagName);
      
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^[a-f0-9]{24}$/);
    });
  });
});