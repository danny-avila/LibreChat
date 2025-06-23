const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { Types } = require('mongoose');
const { connectDb } = require('~/db/connect');
const { createModels } = require('@librechat/data-schemas');
const { logger } = require('~/config');

/**
 * QuickLCMemory Tool - Manages user memories using MongoDB and LibreChat's key-based system
 * 
 * This tool provides an interface to LibreChat's key-based memory system,
 * allowing an agent to manage user-specific information.
 * 
 * Key features:
 * - Uses MongoDB/Mongoose for storage
 * - Aligns with LibreChat's native memory schema (key must be lowercase letters and underscores)
 * - Leverages LibreChat's existing MemoryEntry model
 * - Provides full CRUD operations for user memories.
 */
class QuickLCMemory extends Tool {
  constructor(fields = {}) {
    super();
    
    /** @type {boolean} Used to initialize the Tool without necessary variables. */
    this.override = fields.override ?? false;

    this.userId = fields.userId;
    
    this.name = 'quick_lc_memory';
    this.description = 
      'Manage user memories with simple keys. Store, retrieve, update, and organize information about users across conversations.';
    
    this.description_for_model = 
      `Manages persistent user memories using a key-value system. Allows agents to store and retrieve information about users across sessions.
      
      Key Features:
      - Store user-specific memories with content and a unique key
      - Full CRUD operations on memories
      - User isolation (memories are scoped per user_id)
      
      Common Use Cases:
      - Remember user preferences, details, or context
      - Store business information (companies, projects, team members)
      - Track user goals, interests, or important facts
      - Organize memories with a descriptive key for easy retrieval
      
      Examples:
      - "Jonathan owns a car wash called 'Make Yur Car Klean'" (key: business_info)
      - "Bob has three children" (key: family_details)
      - "The 'Acme Special Project' team members are Bob, Kathy and Tom" (key: project_acme_team)
      
      Guidelines:
      - Use a descriptive key for each memory (e.g., 'user_preferences', 'project_alpha_details').
      - Keys must only contain lowercase letters and underscores.
      - Keep to one fact per memory.
      - Retrieve all memories at the beginning of the conversation to get context.
      - Create new memories as you learn more about the user.
      
      Get detailed help on usage and examples:
      {
        "action": "help"
      }
      `;

    // Database connection will be initialized lazily
    this.models = null;
    this._connectionPromise = null;

    this.schema = z.object({
      action: z.enum([
        'create_memory',
        'update_memory', 
        'get_memories',
        'get_memory',
        'delete_memory',
        'help'
      ]).describe('The action to perform'),
      
      memory_id: z.string().optional().describe('Memory ID for update/get/delete operations'),
      
      content: z.string().min(1).max(10000).optional().describe('Memory content for create/update operations'),

      key: z.string().min(1).max(100).optional().describe('Key to associate with the memory (lowercase letters and underscores only)'),
    });
  }

  // Initialize MongoDB connection (lazy singleton pattern)
  async initDatabase() {
    if (this.models) {
      return this.models;
    }

    if (this._connectionPromise) {
      return this._connectionPromise;
    }

    this._connectionPromise = this._connectToDatabase();
    return this._connectionPromise;
  }

  async _connectToDatabase() {
    try {
      const mongoose = await connectDb();
      this.models = createModels(mongoose);
      logger.info('QuickLCMemory database connection initialized successfully');
      return this.models;
    } catch (error) {
      logger.error('Failed to initialize QuickLCMemory database connection:', error);
      // Reset promise so next call can retry
      this._connectionPromise = null;
      throw error;
    }
  }

  // Ensure database connection
  async ensureConnection() {
    if (!this.models) {
      await this.initDatabase();
    }
    if (!this.models) {
      throw new Error('Database connection not available');
    }
  }

  // Validate a key against LibreChat's schema rules
  validateKey(key) {
    if (!/^[a-z_]+$/.test(key)) {
      throw new Error('Invalid key format. Key must only contain lowercase letters and underscores.');
    }
  }

  // Create a new memory
  async createMemory(userId, content, key) {
    await this.ensureConnection();
    this.validateKey(key);

    try {
      const userObjectId = new Types.ObjectId(userId);
      
      // Check if memory with this key already exists
      const existingMemory = await this.models.MemoryEntry.findOne({ 
        userId: userObjectId, 
        key: key
      });

      if (existingMemory) {
        throw new Error(`Memory with key "${key}" already exists. Please use a unique key or update the existing memory.`);
      }

      // Create the memory entry using LibreChat's structure
      const memoryEntry = await this.models.MemoryEntry.create({
        userId: userObjectId,
        key: key,
        value: content,
        tokenCount: this.estimateTokenCount(content),
        updated_at: new Date(),
        created_at: new Date()
      });

      return this.formatMemoryForResponse(memoryEntry);
    } catch (error) {
      if (error.name === 'CastError') {
        throw new Error('Invalid user ID format');
      }
      if (error.message.includes('already exists')) {
        throw error;
      }
      logger.error('Error creating memory:', error);
      throw new Error('Failed to create memory');
    }
  }

  // Update an existing memory
  async updateMemory(userId, memoryId, content, key = null) {
    await this.ensureConnection();

    try {
      const userObjectId = new Types.ObjectId(userId);
      const memoryObjectId = new Types.ObjectId(memoryId);

      const memory = await this.models.MemoryEntry.findOne({
        _id: memoryObjectId,
        userId: userObjectId
      });

      if (!memory) {
        throw new Error('Memory not found or access denied');
      }

      // Update content
      memory.value = content;
      memory.tokenCount = this.estimateTokenCount(content);
      memory.updated_at = new Date();

      // Update key if it is explicitly provided
      if (key) {
        this.validateKey(key);
        memory.key = key;
      }

      await memory.save();

      return this.formatMemoryForResponse(memory);
    } catch (error) {
      if (error.name === 'CastError') {
        throw new Error('Invalid memory ID or user ID format');
      }
      logger.error('Error updating memory:', error);
      throw new Error('Failed to update memory');
    }
  }

  // Get a specific memory
  async getMemory(memoryId, userId) {
    await this.ensureConnection();

    try {
      const userObjectId = new Types.ObjectId(userId);
      const memoryObjectId = new Types.ObjectId(memoryId);

      const memory = await this.models.MemoryEntry.findOne({
        _id: memoryObjectId,
        userId: userObjectId
      });

      if (!memory) {
        return null;
      }

      return this.formatMemoryForResponse(memory);
    } catch (error) {
      if (error.name === 'CastError') {
        logger.warn('Invalid ID format in getMemory:', { memoryId, userId });
        return null;
      }
      logger.error('Error getting memory:', error);
      return null;
    }
  }

  // Get all memories for a user
  async getMemories(userId) {
    await this.ensureConnection();

    try {
      const userObjectId = new Types.ObjectId(userId);
      const query = { userId: userObjectId };

      const memories = await this.models.MemoryEntry.find(query)
        .sort({ updated_at: -1 })
        .lean();

      return memories.map(memory => this.formatMemoryForResponse(memory));
    } catch (error) {
      if (error.name === 'CastError') {
        logger.warn('Invalid user ID format in getMemories:', userId);
        return [];
      }
      logger.error('Error getting memories:', error);
      return [];
    }
  }

  // Delete a memory
  async deleteMemory(userId, memoryId) {
    await this.ensureConnection();

    try {
      const userObjectId = new Types.ObjectId(userId);
      const memoryObjectId = new Types.ObjectId(memoryId);

      const result = await this.models.MemoryEntry.deleteOne({
        _id: memoryObjectId,
        userId: userObjectId
      });

      return result.deletedCount > 0;
    } catch (error) {
      if (error.name === 'CastError') {
        logger.warn('Invalid ID format in deleteMemory:', { userId, memoryId });
        return false;
      }
      logger.error('Error deleting memory:', error);
      return false;
    }
  }

  // Helper methods

  estimateTokenCount(text) {
    // Simple token estimation (roughly 4 characters per token)
    return Math.ceil(text.length / 4);
  }

  formatMemoryForResponse(memory) {
    return {
      id: memory._id.toString(),
      user_id: memory.userId.toString(),
      content: memory.value,
      key: memory.key,
      created_at: memory.created_at ? memory.created_at.getTime() : (memory.updated_at ? memory.updated_at.getTime() : Date.now()),
      updated_at: memory.updated_at ? memory.updated_at.getTime() : Date.now(),
    };
  }

  showHelp() {
    return `
=== QuickLCMemory Tool Help ===

OVERVIEW:
---------
QuickLCMemory is a tool for storing and retrieving persistent user memories using a key-value system.
It uses MongoDB through LibreChat's infrastructure to store memories that persist across conversations.

BASIC USAGE:
-----------
{
  "action": "create_memory",
  "content": "User likes chocolate ice cream",
  "key": "user_preferences"
}

ACTIONS:
-------
1) create_memory:
   - Creates a new memory entry
   - Required: "content", "key"
   - Key must only contain lowercase letters and underscores (e.g., 'favorite_movie').

2) update_memory:
   - Updates an existing memory entry
   - Required: "memory_id", "content"
   - Optional: "key" (to change the key)

3) get_memory:
   - Retrieves a specific memory by ID
   - Required: "memory_id"

4) get_memories:
   - Retrieves all memories for the current user.

5) delete_memory:
   - Deletes a specific memory
   - Required: "memory_id"

6) help:
   - Shows this help information

EXAMPLES:
--------

1) Create a new memory with a key:
   {
     "action": "create_memory",
     "content": "User's favorite movie is The Matrix",
     "key": "favorite_movie"
   }

2) Get all memories:
   {
     "action": "get_memories"
   }

3) Update an existing memory's content:
   {
     "action": "update_memory",
     "memory_id": "6151f3da3821a52634985432",
     "content": "User's favorite movie is Inception"
   }

4) Update an existing memory's key:
   {
     "action": "update_memory",
     "memory_id": "6151f3da3821a52634985432",
     "content": "User's favorite movie is Inception",
     "key": "top_movie"
   }

5) Delete a memory:
   {
     "action": "delete_memory",
     "memory_id": "6151f3da3821a52634985432"
   }

6) Show this help information:
   {
     "action": "help"
   }

IMPORTANT NOTES:
--------------
- Keys must be simple lowercase text with underscores (e.g., "preferences", "family_details", "work_info").
- Each memory should represent one fact/piece of information.
`;
  }

  async _call(input) {
    try {
      // Handle help action first
      if (input.action === 'help') {
        return this.showHelp();
      }
      
      // Validate input against schema
      const validationResult = this.schema.safeParse(input);
      
      if (!validationResult.success) {
        logger.warn('QuickLCMemory validation failed:', validationResult.error.errors);
        return JSON.stringify({
          error: 'Invalid input parameters',
          code: 'VALIDATION_ERROR'
        });
      }

      const {
        action,
        memory_id,
        content,
        key,
      } = validationResult.data;

      if (!this.userId) {
        return JSON.stringify({
          error: 'userId is required for all operations'
        });
      }

      switch (action) {
        case 'create_memory':
          if (!content || !key) {
            return JSON.stringify({ error: 'content and key are required for create_memory' });
          }
          const newMemory = await this.createMemory(this.userId, content, key);
          return JSON.stringify({
            success: true,
            memory: newMemory,
            message: 'Memory created successfully'
          });

        case 'update_memory':
          if (!memory_id || !content) {
            return JSON.stringify({ error: 'memory_id and content are required for update_memory' });
          }
          const updatedMemory = await this.updateMemory(this.userId, memory_id, content, key);
          return JSON.stringify({
            success: true,
            memory: updatedMemory,
            message: 'Memory updated successfully'
          });

        case 'get_memory':
          if (!memory_id) {
            return JSON.stringify({ error: 'memory_id is required for get_memory' });
          }
          const memory = await this.getMemory(memory_id, this.userId);
          if (!memory) {
            return JSON.stringify({ error: 'Memory not found' });
          }
          return JSON.stringify({
            success: true,
            memory: memory
          });

        case 'get_memories':
          const memories = await this.getMemories(this.userId);
          return JSON.stringify({
            success: true,
            memories: memories,
            count: memories.length
          });

        case 'delete_memory':
          if (!memory_id) {
            return JSON.stringify({ error: 'memory_id is required for delete_memory' });
          }
          const deleted = await this.deleteMemory(this.userId, memory_id);
          if (!deleted) {
            return JSON.stringify({ error: 'Memory not found or access denied' });
          }
          return JSON.stringify({
            success: true,
            message: 'Memory deleted successfully'
          });

        default:
          logger.warn(`Unknown action requested in QuickLCMemory: ${action}`);
          return JSON.stringify({
            error: 'Invalid action',
            code: 'INVALID_ACTION'
          });
      }

    } catch (error) {
      logger.error('QuickLCMemory error:', error);
      return JSON.stringify({
        error: error.message || 'UserMemory operation failed',
        code: 'MEMORY_OPERATION_ERROR'
      });
    }
  }
}

module.exports = QuickLCMemory;