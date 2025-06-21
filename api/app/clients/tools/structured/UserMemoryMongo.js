const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { Types } = require('mongoose');
const { connectDb } = require('~/db/connect');
const { createModels } = require('@librechat/data-schemas');
const { logger } = require('~/config');

/**
 * UserMemoryMongo Tool - Manages user memories using MongoDB and LibreChat's key-based system
 * 
 * This tool provides a single-tag variation of the UserMemory tool but uses
 * LibreChat's MongoDB infrastructure. It maps a single tag to LibreChat's key-based
 * memory system.
 * 
 * Key features:
 * - Uses MongoDB/Mongoose for storage
 * - Uses a single tag as the memory key (LibreChat supports only one key per memory)
 * - Maps tags to LibreChat's key system (keys must be lowercase letters and underscores)
 * - Leverages LibreChat's existing MemoryEntry model
 * - API uses single 'tag' property instead of 'tags' array to be explicit about single-tag design
 */
class UserMemoryMongo extends Tool {
  constructor(fields = {}) {
    super();
    
    /** @type {boolean} Used to initialize the Tool without necessary variables. */
    this.override = fields.override ?? false;

    this.userId = fields.userId;
    
    this.name = 'user_memory_mongo';
    this.description = 
      'Manage user memories with single tag keys. Store, retrieve, update, and organize information about users across conversations. ' +
      'Supports a single tag per memory for better organization and retrieval.';
    
    this.description_for_model = 
      `Manages persistent user memories with a single tag per memory. Allows agents to store and retrieve information about users across sessions.
      
      Key Features:
      - Store user-specific memories with content and a single tag
      - Full CRUD operations on memories and tags
      - Tag-based filtering and organization
      - User isolation (memories are scoped per user_id)
      
      Common Use Cases:
      - Remember user preferences, details, or context
      - Store business information (companies, projects, team members)
      - Track user goals, interests, or important facts
      - Organize memories with a tag for easy retrieval
      
      Examples:
      - "Jonathan owns a car wash called 'Make Yur Car Klean'" (tag: business)
      - "Bob has three children" (tag: family)
      - "The 'Acme Special Project' team members are Bob, Kathy and Tom" (tag: project)
      
      Guidelines:
      - Always use a single descriptive tag for each memory
      - Keep to one fact per memory
      - Retrieve all tags before creating a memory 
      - Retrieve all memories at the beginning of the conversation
      - Create new memories as you learn more about the user
      
      IMPORTANT: This tool only supports a single tag per memory, not an array of tags.
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
        'create_tag',
        'get_tags',
        'update_tag',
        'delete_tag'
      ]).describe('The action to perform'),
      
      memory_id: z.string().optional().describe('Memory ID for update/get/delete operations'),
      
      content: z.string().min(1).max(10000).optional().describe('Memory content for create/update operations'),
      
      tag: z.string().min(1).max(100).optional().describe('Tag name to associate with memory'),
      
      tag_filter: z.string().min(1).max(100).optional().describe('Filter memories by tag name'),
      
      tag_id: z.string().optional().describe('Tag ID for tag update/delete operations'),
      
      tag_name: z.string().min(1).max(100).optional().describe('Tag name for create/update tag operations'),
      
      new_tag_name: z.string().min(1).max(100).optional().describe('New name when updating a tag')
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
      logger.info('UserMemoryMongo database connection initialized successfully');
      return this.models;
    } catch (error) {
      logger.error('Failed to initialize UserMemoryMongo database connection:', error);
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

  // Create a new memory
  async createMemory(userId, content, tag = '') {
    await this.ensureConnection();

    try {
      const userObjectId = new Types.ObjectId(userId);

      // Generate a proper LibreChat key from content and tag
      const memoryKey = this.generateLibreChatKey(content, tag);
      
      // Check if memory with this key already exists
      const existingMemory = await this.models.MemoryEntry.findOne({ 
        userId: userObjectId, 
        key: memoryKey 
      });

      if (existingMemory) {
        throw new Error('Memory with similar content already exists');
      }

      // Create the memory entry using LibreChat's structure
      const memoryEntry = await this.models.MemoryEntry.create({
        userId: userObjectId,
        key: memoryKey,
        value: content,
        tokenCount: this.estimateTokenCount(content),
        updated_at: new Date(),
        created_at: new Date()
      });

      return this.formatMemoryForResponse(memoryEntry, tag);
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
  async updateMemory(userId, memoryId, content, tag = null) {
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

      // Update content and generate new key if tag provided
      memory.value = content;
      memory.tokenCount = this.estimateTokenCount(content);
      memory.updated_at = new Date();

      // Update key if tag is explicitly provided (not null or undefined)
      if (tag !== undefined && tag !== null) {
        const newKey = this.generateLibreChatKey(content, tag);
        memory.key = newKey;
      }

      await memory.save();

      return this.formatMemoryForResponse(memory, tag);
    } catch (error) {
      if (error.name === 'CastError') {
        throw new Error('Invalid memory ID or user ID format');
      }
      logger.error('Error updating memory:', error);
      throw new Error('Failed to update memory');
    }
  }

  // Get a specific memory with its tags
  async getMemoryWithTags(memoryId, userId) {
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
        logger.warn('Invalid ID format in getMemoryWithTags:', { memoryId, userId });
        return null;
      }
      logger.error('Error getting memory:', error);
      return null;
    }
  }

  // Get all memories for a user, optionally filtered by tag
  async getMemories(userId, tagFilter = null) {
    await this.ensureConnection();

    try {
      const userObjectId = new Types.ObjectId(userId);
      let query = { userId: userObjectId };

      // Apply tag filter if provided - search for tag in the key
      if (tagFilter && tagFilter.length > 0) {
        // Sanitize and escape regex special characters
        const sanitizedTag = this.sanitizeKeyComponent(tagFilter)
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape regex chars
        
        if (sanitizedTag.length > 0) {
          // Use a regex that matches keys starting with the tag
          const tagRegex = new RegExp(`^${sanitizedTag}_`, 'i');
          query.key = { $regex: tagRegex };
        }
      }

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

  // Create a new tag (virtual - tags are embedded in keys)
  async createTag(userId, tagName) {
    await this.ensureConnection();

    // In LibreChat's key-based system, tags are embedded in memory keys
    // We return a virtual tag for API compatibility
    const sanitizedTag = this.sanitizeKeyComponent(tagName);
    
    if (!sanitizedTag) {
      throw new Error('Tag name must contain at least one letter or number');
    }
    
    return {
      id: this.generateTagId(sanitizedTag),
      name: sanitizedTag,
      created_at: Date.now()
    };
  }

  // Get all tags (extracted from memory keys)
  async getTags(userId) {
    await this.ensureConnection();

    const userObjectId = new Types.ObjectId(userId);

    try {
      const memories = await this.models.MemoryEntry.find({ userId: userObjectId })
        .select('key updated_at')
        .lean();

      const tagMap = new Map(); // Use Map to track first occurrence dates
      
      memories.forEach(memory => {
        const extractedTags = this.extractTagsFromKey(memory.key);
        extractedTags.forEach(tag => {
          if (tag && !tagMap.has(tag)) {
            tagMap.set(tag, memory.updated_at || new Date());
          }
        });
      });

      return Array.from(tagMap.entries()).map(([tag, date]) => ({
        id: this.generateTagId(tag),
        name: tag,
        created_at: date.getTime()
      }));
    } catch (error) {
      logger.error('Error getting tags:', error);
      return [];
    }
  }

  // Update a tag name - updates all memories containing the old tag
  async updateTag(userId, tagId, newName) {
    await this.ensureConnection();
    
    const userObjectId = new Types.ObjectId(userId);
    const sanitizedNewName = this.sanitizeKeyComponent(newName);
    
    if (!sanitizedNewName) {
      throw new Error('New tag name must contain at least one letter or number');
    }
    
    try {
      // First, find a memory that contains this tag to identify the old tag name
      // Use a limited query instead of loading all memories
      const sampleMemories = await this.models.MemoryEntry.find({ userId: userObjectId })
        .select('key value')
        .limit(100)
        .lean();
      
      let oldTagName = null;
      for (const memory of sampleMemories) {
        const tags = this.extractTagsFromKey(memory.key);
        for (const tag of tags) {
          if (this.generateTagId(tag) === tagId) {
            oldTagName = tag;
            break;
          }
        }
        if (oldTagName) break;
      }
      
      if (!oldTagName) {
        return false; // Tag not found
      }
      
      // Escape the old tag name for regex
      const escapedOldTag = oldTagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Find all memories containing the old tag using efficient regex
      const memoriesToUpdate = await this.models.MemoryEntry.find({
        userId: userObjectId,
        key: { $regex: `\\b${escapedOldTag}\\b`, $options: 'i' }
      }).select('_id key value').lean();
      
      if (memoriesToUpdate.length === 0) {
        return false;
      }
      
      // Update memories in batches to avoid timeout
      const batchSize = 50;
      let updatedCount = 0;
      
      for (let i = 0; i < memoriesToUpdate.length; i += batchSize) {
        const batch = memoriesToUpdate.slice(i, i + batchSize);
        const bulkOps = [];
        
        for (const memory of batch) {
          const tags = this.extractTagsFromKey(memory.key);
          if (tags.includes(oldTagName)) {
            const updatedTags = tags.map(tag => tag === oldTagName ? sanitizedNewName : tag);
            const newKey = this.generateLibreChatKey(memory.value, updatedTags);
            
            bulkOps.push({
              updateOne: {
                filter: { _id: memory._id },
                update: { key: newKey, updated_at: new Date() }
              }
            });
          }
        }
        
        if (bulkOps.length > 0) {
          const result = await this.models.MemoryEntry.bulkWrite(bulkOps);
          updatedCount += result.modifiedCount;
        }
      }
      
      return updatedCount > 0;
    } catch (error) {
      if (error.name === 'CastError') {
        logger.warn('Invalid user ID format in updateTag:', userId);
        return false;
      }
      logger.error('Error updating tag:', error);
      return false;
    }
  }

  // Delete a tag - removes tag from all memories containing it
  async deleteTag(userId, tagId) {
    await this.ensureConnection();
    
    try {
      const userObjectId = new Types.ObjectId(userId);
      
      // First, find a memory that contains this tag to identify the tag name
      // Use a limited query instead of loading all memories
      const sampleMemories = await this.models.MemoryEntry.find({ userId: userObjectId })
        .select('key value')
        .limit(100)
        .lean();
      
      let targetTagName = null;
      for (const memory of sampleMemories) {
        const tags = this.extractTagsFromKey(memory.key);
        for (const tag of tags) {
          if (this.generateTagId(tag) === tagId) {
            targetTagName = tag;
            break;
          }
        }
        if (targetTagName) break;
      }
      
      if (!targetTagName) {
        return false; // Tag not found
      }
      
      // Escape the target tag name for regex
      const escapedTargetTag = targetTagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Find all memories containing the target tag using efficient regex
      const memoriesToUpdate = await this.models.MemoryEntry.find({
        userId: userObjectId,
        key: { $regex: `\\b${escapedTargetTag}\\b`, $options: 'i' }
      }).select('_id key value').lean();
      
      if (memoriesToUpdate.length === 0) {
        return false;
      }
      
      // Update memories in batches to avoid timeout
      const batchSize = 50;
      let updatedCount = 0;
      
      for (let i = 0; i < memoriesToUpdate.length; i += batchSize) {
        const batch = memoriesToUpdate.slice(i, i + batchSize);
        const bulkOps = [];
        
        for (const memory of batch) {
          const tags = this.extractTagsFromKey(memory.key);
          if (tags.includes(targetTagName)) {
            // Remove the target tag
            const updatedTags = tags.filter(tag => tag !== targetTagName);
            const newKey = this.generateLibreChatKey(memory.value, updatedTags);
            
            bulkOps.push({
              updateOne: {
                filter: { _id: memory._id },
                update: { key: newKey, updated_at: new Date() }
              }
            });
          }
        }
        
        if (bulkOps.length > 0) {
          const result = await this.models.MemoryEntry.bulkWrite(bulkOps);
          updatedCount += result.modifiedCount;
        }
      }
      
      return updatedCount > 0;
    } catch (error) {
      if (error.name === 'CastError') {
        logger.warn('Invalid user ID format in deleteTag:', userId);
        return false;
      }
      logger.error('Error deleting tag:', error);
      return false;
    }
  }

  // Helper methods

  // Generate LibreChat-compatible key (lowercase letters and underscores only)
  generateLibreChatKey(content, tag = '') {
    // LibreChat only supports a single tag/key per memory
    
    // Extract meaningful words from content for key generation
    const contentWords = content
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, '') // Remove non-alphanumeric except spaces
      .split(/\s+/)
      .filter(word => word.length > 2) // Only meaningful words
      .slice(0, 3); // First 3 words max
    
    // Start with content words
    let baseKey = contentWords.join('_');
    
    // If tag is provided, use it as the primary key
    if (tag) {
      const primaryTag = this.sanitizeKeyComponent(tag);
      if (primaryTag) {
        baseKey = primaryTag; // Use the tag as the key
      }
    }
    
    // Ensure we have a valid key
    baseKey = baseKey || 'memory';
    
    // Add short hash for uniqueness while keeping key readable
    const hash = require('crypto').createHash('md5').update(content + tag).digest('hex');
    
    return `${baseKey}_${hash.substring(0, 8)}`;
  }

  // Sanitize component for LibreChat key (only lowercase letters and numbers)
  sanitizeKeyComponent(component) {
    return component
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '') // Remove everything except lowercase letters and numbers
      .substring(0, 20); // Limit length
  }

  generateTagId(tagName) {
    const hash = require('crypto').createHash('md5').update(tagName.toLowerCase()).digest('hex');
    return hash.substring(0, 24); // MongoDB ObjectId-like length
  }

  estimateTokenCount(text) {
    // Simple token estimation (roughly 4 characters per token)
    return Math.ceil(text.length / 4);
  }

  // Extract tag from LibreChat key - now we extract only the single primary tag
  extractTagFromKey(key) {
    // Split key by underscores to get the first part (the primary tag)
    const parts = key.split('_');
    
    // Get the first part, which should be the primary tag
    const primaryTag = parts[0];
    
    // Validate it's not a hash suffix and not "memory"
    if (primaryTag && primaryTag.length > 2 && 
        primaryTag !== 'memory' && 
        !/^[a-f0-9]{8}$/.test(primaryTag)) {
      return primaryTag; // Return the tag directly
    }
    
    // No valid tag found
    return '';
  }

  formatMemoryForResponse(memory, tag = null) {
    // If explicit tag is provided, use it; otherwise extract from key
    const finalTag = tag || this.extractTagFromKey(memory.key);
    
    return {
      id: memory._id.toString(),
      user_id: memory.userId.toString(),
      content: memory.value,
      created_at: memory.created_at ? memory.created_at.getTime() : (memory.updated_at ? memory.updated_at.getTime() : Date.now()),
      updated_at: memory.updated_at ? memory.updated_at.getTime() : Date.now(),
      tag: finalTag // Return single tag string
    };
  }

  async _call(input) {
    try {
      // Validate input against schema
      const validationResult = this.schema.safeParse(input);
      
      if (!validationResult.success) {
        logger.warn('UserMemoryMongo validation failed:', validationResult.error.errors);
        return JSON.stringify({
          error: 'Invalid input parameters',
          code: 'VALIDATION_ERROR'
        });
      }

      const {
        action,
        memory_id,
        content,
        tag,
        tag_filter,
        tag_id,
        tag_name,
        new_tag_name
      } = validationResult.data;

      if (!this.userId) {
        return JSON.stringify({
          error: 'userId is required for all operations'
        });
      }

      switch (action) {
        case 'create_memory':
          if (!content) {
            return JSON.stringify({ error: 'content is required for create_memory' });
          }
          const newMemory = await this.createMemory(this.userId, content, tag);
          return JSON.stringify({
            success: true,
            memory: newMemory,
            message: 'Memory created successfully'
          });

        case 'update_memory':
          if (!memory_id || !content) {
            return JSON.stringify({ error: 'memory_id and content are required for update_memory' });
          }
          const updatedMemory = await this.updateMemory(this.userId, memory_id, content, tag);
          return JSON.stringify({
            success: true,
            memory: updatedMemory,
            message: 'Memory updated successfully'
          });

        case 'get_memory':
          if (!memory_id) {
            return JSON.stringify({ error: 'memory_id is required for get_memory' });
          }
          const memory = await this.getMemoryWithTags(memory_id, this.userId);
          if (!memory) {
            return JSON.stringify({ error: 'Memory not found' });
          }
          return JSON.stringify({
            success: true,
            memory: memory
          });

        case 'get_memories':
          const memories = await this.getMemories(this.userId, tag_filter);
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

        case 'create_tag':
          if (!tag_name) {
            return JSON.stringify({ error: 'tag_name is required for create_tag' });
          }
          const newTag = await this.createTag(this.userId, tag_name);
          return JSON.stringify({
            success: true,
            tag: newTag,
            message: 'Tag created successfully'
          });

        case 'get_tags':
          const allTags = await this.getTags(this.userId);
          return JSON.stringify({
            success: true,
            tags: allTags,
            count: allTags.length
          });

        case 'update_tag':
          if (!tag_id || !new_tag_name) {
            return JSON.stringify({ error: 'tag_id and new_tag_name are required for update_tag' });
          }
          const tagUpdated = await this.updateTag(this.userId, tag_id, new_tag_name);
          if (!tagUpdated) {
            return JSON.stringify({ error: 'Tag not found' });
          }
          return JSON.stringify({
            success: true,
            message: 'Tag updated successfully'
          });

        case 'delete_tag':
          if (!tag_id) {
            return JSON.stringify({ error: 'tag_id is required for delete_tag' });
          }
          const tagDeleted = await this.deleteTag(this.userId, tag_id);
          if (!tagDeleted) {
            return JSON.stringify({ error: 'Tag not found' });
          }
          return JSON.stringify({
            success: true,
            message: 'Tag deleted successfully'
          });

        default:
          logger.warn(`Unknown action requested in UserMemoryMongo: ${action}`);
          return JSON.stringify({
            error: 'Invalid action',
            code: 'INVALID_ACTION'
          });
      }

    } catch (error) {
      logger.error('UserMemoryMongo error:', error);
      return JSON.stringify({
        error: 'UserMemory operation failed',
        code: 'MEMORY_OPERATION_ERROR'
      });
    }
  }
}

module.exports = UserMemoryMongo;