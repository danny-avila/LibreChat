const { Tool } = require('@langchain/core/tools');
const { z } = require('zod');
const { logger } = require('@librechat/data-schemas');

// PostgreSQL client
const { Pool } = require('pg');

// For embeddings - using same approach as RAG API
const axios = require('axios');

class Collections extends Tool {
  name = 'collections';
  description_for_model = 'Allows the assistant to manage organized collections of notes, facts, sources, and information across sessions. You can create and organize collections in a hierarchical structure with parent-child relationships. Actions: create_collection, list_collections, search_collections, add_note, search_notes, delete_note, update_note, update_collection, delete_collection. Use add_note to store new information, search_notes to retrieve relevant information, and organize collections hierarchically.';
  description =
    'Store and retrieve organized knowledge in collections with hierarchical structure. ' +
    'Actions: create_collection, list_collections, search_collections, add_note, search_notes, delete_note, update_note, update_collection, delete_collection. ' +
    'Supports keyword, semantic, and hybrid search across all notes. ' +
    'Perfect for maintaining organized information across multiple chat sessions.';

  schema = z.object({
    action: z.enum([
      'create_collection', 
      'list_collections', 
      'search_collections',
      'add_note', 
      'search_notes', 
      'delete_note',
      'update_note',
      'update_collection',
      'delete_collection'
    ]),
    collection_name: z.string().optional(),
    collection_description: z.string().optional(),
    collection_tags: z.array(z.string()).optional(),
    collection_id: z.string().optional(),
    parent_collection_id: z.string().optional(),
    note_title: z.string().optional(),
    note_content: z.string().optional(),
    note_source_url: z.string().optional(),
    note_tags: z.array(z.string()).optional(),
    note_id: z.string().optional(),
    search_query: z.string().optional(),
    search_mode: z.enum(['keyword', 'semantic', 'hybrid']).optional(),
    limit: z.number().min(1).max(100).optional(),
    tag_filter: z.array(z.string()).optional(),
    recursive: z.boolean().optional(),
  });

  constructor(fields = {}) {
    super();
    this.userId = null; // Will be set from request context
    this.pool = null;
    // store promise so callers can await readiness before executing queries
    this.ready = this.initializeDatabase();
  }

  async initializeDatabase() {
    try {
      this.pool = new Pool({
        host: process.env.POSTGRES_HOST || 'vectordb',
        port: process.env.POSTGRES_PORT || 5432,
        database: process.env.POSTGRES_DB || 'mydatabase',
        user: process.env.POSTGRES_USER || 'myuser',
        password: process.env.POSTGRES_PASSWORD || 'mypassword',
      });

      // Test connection and create tables if needed
      await this.ensureTables();
    } catch (error) {
      logger.error('Failed to initialize Collections database:', error);
    }
  }

  async ensureTables() {
    const client = await this.pool.connect();
    try {
      // Enable pgvector extension
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');
      // Enable pgcrypto for gen_random_uuid()
      await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

      // Create collections table (replacing projects table)
      await client.query(`
        CREATE TABLE IF NOT EXISTS collections (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          parent_id UUID REFERENCES collections(id) ON DELETE CASCADE NULL,
          tags TEXT[] DEFAULT '{}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create notes table (replacing project_notes)
      await client.query(`
        CREATE TABLE IF NOT EXISTS notes (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          source_url TEXT,
          tags TEXT[] DEFAULT '{}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create note_vectors table
      await client.query(`
        CREATE TABLE IF NOT EXISTS note_vectors (
          note_id UUID PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
          embedding vector(1536)
        )
      `);

      // Create indexes
      await client.query('CREATE INDEX IF NOT EXISTS idx_collections_user_id ON collections(user_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_collections_parent_id ON collections(parent_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_collections_tags ON collections USING GIN(tags)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_notes_collection_id ON notes(collection_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_notes_tags ON notes USING GIN(tags)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_notes_content_fulltext ON notes USING GIN(to_tsvector(\'english\', content))');
      await client.query('CREATE INDEX IF NOT EXISTS idx_note_vectors_embedding ON note_vectors USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)');

    } finally {
      client.release();
    }
  }

  async generateEmbedding(text) {
    try {
      // Try to use the same embedding service as the RAG API
      if (process.env.RAG_API_URL) {
        const response = await axios.post(`${process.env.RAG_API_URL}/embed-text`, {
          text: text,
        });
        return response.data.embedding;
      }

      // Fallback to OpenAI if RAG API not available
      if (process.env.OPENAI_API_KEY) {
        const response = await axios.post('https://api.openai.com/v1/embeddings', {
          input: text,
          model: 'text-embedding-3-small',
        }, {
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
        });
        return response.data.data[0].embedding;
      }

      throw new Error('No embedding service available');
    } catch (error) {
      logger.error('Failed to generate embedding:', error);
      return null;
    }
  }

  setUserId(userId) {
    this.userId = userId;
  }

  async createCollection(name, description = '', tags = [], parentId = null) {
    const client = await this.pool.connect();
    try {
      // If parent_id is provided, verify it exists and belongs to user
      if (parentId) {
        const parentCheck = await client.query(
          'SELECT id FROM collections WHERE id = $1 AND user_id = $2',
          [parentId, this.userId]
        );

        if (parentCheck.rows.length === 0) {
          throw new Error('Parent collection not found or access denied');
        }
      }

      const result = await client.query(
        'INSERT INTO collections (user_id, name, description, tags, parent_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [this.userId, name, description, tags, parentId]
      );
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async updateCollection(collectionId, updates = {}) {
    const client = await this.pool.connect();
    try {
      // Verify collection belongs to user
      const collectionCheck = await client.query(
        'SELECT id FROM collections WHERE id = $1 AND user_id = $2',
        [collectionId, this.userId]
      );

      if (collectionCheck.rows.length === 0) {
        throw new Error('Collection not found or access denied');
      }

      // Build the update query dynamically based on which fields are provided
      const updateFields = [];
      const queryParams = [collectionId]; // Start with collection_id
      let paramCounter = 2; // Start from $2

      if (updates.name !== undefined) {
        updateFields.push(`name = $${paramCounter++}`);
        queryParams.push(updates.name);
      }

      if (updates.description !== undefined) {
        updateFields.push(`description = $${paramCounter++}`);
        queryParams.push(updates.description);
      }

      if (updates.tags !== undefined) {
        updateFields.push(`tags = $${paramCounter++}`);
        queryParams.push(updates.tags);
      }

      if (updates.parent_id !== undefined) {
        // If parent_id is being set, verify it exists and belongs to user
        if (updates.parent_id) {
          const parentCheck = await client.query(
            'SELECT id FROM collections WHERE id = $1 AND user_id = $2',
            [updates.parent_id, this.userId]
          );

          if (parentCheck.rows.length === 0) {
            throw new Error('Parent collection not found or access denied');
          }

          // Prevent circular references
          const isCircular = await this.wouldCreateCircularReference(client, collectionId, updates.parent_id);
          if (isCircular) {
            throw new Error('Cannot set parent: would create circular reference');
          }
        }

        updateFields.push(`parent_id = $${paramCounter++}`);
        queryParams.push(updates.parent_id);
      }

      // Always update the updated_at timestamp
      updateFields.push('updated_at = CURRENT_TIMESTAMP');

      if (updateFields.length === 0) {
        // Nothing to update
        return null;
      }

      const query = `
        UPDATE collections
        SET ${updateFields.join(', ')}
        WHERE id = $1
        RETURNING *
      `;

      const result = await client.query(query, queryParams);
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async wouldCreateCircularReference(client, collectionId, parentId) {
    // Base case: if trying to set collection as its own parent
    if (collectionId === parentId) {
      return true;
    }

    // Start with the proposed parent
    let currentId = parentId;
    const visited = new Set();

    // Traverse up the parent chain
    while (currentId) {
      // If we've seen this ID before, there's a cycle
      if (visited.has(currentId)) {
        return true;
      }
      visited.add(currentId);

      // Get the parent of the current node
      const result = await client.query(
        'SELECT parent_id FROM collections WHERE id = $1',
        [currentId]
      );

      // If no results or no parent, we've reached the top
      if (result.rows.length === 0 || !result.rows[0].parent_id) {
        return false;
      }

      // If the parent is our original collection, this would create a cycle
      if (result.rows[0].parent_id === collectionId) {
        return true;
      }

      // Move up to the parent
      currentId = result.rows[0].parent_id;
    }

    return false;
  }

  async deleteCollection(collectionId) {
    const client = await this.pool.connect();
    try {
      // Verify collection belongs to user
      const collectionCheck = await client.query(
        'SELECT id FROM collections WHERE id = $1 AND user_id = $2',
        [collectionId, this.userId]
      );

      if (collectionCheck.rows.length === 0) {
        throw new Error('Collection not found or access denied');
      }

      // First, handle child collections recursively
      // Option 1: Delete child collections (cascade delete)
      // Option 2: Orphan child collections (set parent_id to null)
      // We'll go with Option 1 for complete deletion

      await client.query('BEGIN');

      // Perform the delete - this will cascade to notes and child collections
      const result = await client.query(
        'DELETE FROM collections WHERE id = $1 RETURNING *',
        [collectionId]
      );

      await client.query('COMMIT');
      
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listCollections(params = {}) {
    const {
      parentId = null,
      tagFilter = null,
      limit = 50,
      recursive = false
    } = params;

    const client = await this.pool.connect();
    try {
      // If recursive is true and parentId is provided, we need to get all descendants
      if (recursive && parentId) {
        return this.listCollectionsRecursive(client, parentId, tagFilter, limit);
      }

      // Basic query for direct children or top-level collections
      let query = 'SELECT * FROM collections WHERE user_id = $1';
      let queryParams = [this.userId];
      let paramIndex = 2;

      if (parentId === null) {
        // Get only top-level collections (no parent)
        query += ' AND parent_id IS NULL';
      } else {
        // Get children of a specific collection
        query += ` AND parent_id = $${paramIndex++}`;
        queryParams.push(parentId);
      }

      if (tagFilter && tagFilter.length > 0) {
        query += ` AND tags && $${paramIndex++}`;
        queryParams.push(tagFilter);
      }

      query += ' ORDER BY updated_at DESC';
      
      if (limit) {
        query += ` LIMIT $${paramIndex++}`;
        queryParams.push(limit);
      }

      const result = await client.query(query, queryParams);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async listCollectionsRecursive(client, parentId, tagFilter = null, limit = null) {
    // This is a recursive CTE (Common Table Expression) to get all descendants
    let query = `
      WITH RECURSIVE collection_tree AS (
        -- Base case: the parent collection
        SELECT c.*, 0 AS depth
        FROM collections c
        WHERE c.id = $1 AND c.user_id = $2
        
        UNION ALL
        
        -- Recursive case: child collections
        SELECT c.*, ct.depth + 1
        FROM collections c
        JOIN collection_tree ct ON c.parent_id = ct.id
        WHERE c.user_id = $2
      )
      SELECT * FROM collection_tree
    `;

    let params = [parentId, this.userId];
    let paramIndex = 3;

    if (tagFilter && tagFilter.length > 0) {
      query += ` WHERE tags && $${paramIndex++}`;
      params.push(tagFilter);
    }

    query += ' ORDER BY depth, updated_at DESC';
    
    if (limit) {
      query += ` LIMIT $${paramIndex++}`;
      params.push(limit);
    }

    const result = await client.query(query, params);
    return result.rows;
  }

  async searchCollections(searchQuery, tagFilter = null, limit = 20) {
    const client = await this.pool.connect();
    try {
      // Search collections by name, description, and tags
      let query = `
        SELECT *, 
               ts_rank(to_tsvector('english', name || ' ' || description), plainto_tsquery('english', $1)) as score
        FROM collections
        WHERE user_id = $2
        AND (
          to_tsvector('english', name || ' ' || description) @@ plainto_tsquery('english', $1)
          OR name ILIKE $3
          OR description ILIKE $3
        )
      `;
      
      let params = [searchQuery, this.userId, `%${searchQuery}%`];
      let paramIndex = 4;

      if (tagFilter && tagFilter.length > 0) {
        query += ` AND tags && $${paramIndex++}`;
        params.push(tagFilter);
      }

      query += ' ORDER BY score DESC';
      
      if (limit) {
        query += ` LIMIT $${paramIndex++}`;
        params.push(limit);
      }

      const result = await client.query(query, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async addNote(collectionId, title, content, sourceUrl = null, tags = []) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Verify collection belongs to user
      const collectionCheck = await client.query(
        'SELECT id FROM collections WHERE id = $1 AND user_id = $2',
        [collectionId, this.userId]
      );

      if (collectionCheck.rows.length === 0) {
        throw new Error('Collection not found or access denied');
      }

      // Insert note
      const noteResult = await client.query(
        'INSERT INTO notes (collection_id, title, content, source_url, tags) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [collectionId, title, content, sourceUrl, tags]
      );

      const note = noteResult.rows[0];

      // Generate and store embedding
      const embedding = await this.generateEmbedding(`${title}\n\n${content}`);
      if (embedding) {
        // Convert JS array to pgvector literal '[v1,v2,...]'
        const vectorLiteral = `[${embedding.join(',')}]`;
        await client.query(
          'INSERT INTO note_vectors (note_id, embedding) VALUES ($1, $2::vector)',
          [note.id, vectorLiteral]
        );
      }

      // Update collection timestamp
      await client.query(
        'UPDATE collections SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [collectionId]
      );

      await client.query('COMMIT');
      return note;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateNote(noteId, updates = {}) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Verify note belongs to user (through collection ownership)
      const noteCheck = await client.query(`
        SELECT n.* 
        FROM notes n
        JOIN collections c ON n.collection_id = c.id
        WHERE n.id = $1 AND c.user_id = $2
      `, [noteId, this.userId]);

      if (noteCheck.rows.length === 0) {
        throw new Error('Note not found or access denied');
      }

      const note = noteCheck.rows[0];
      const updateFields = [];
      const queryParams = [noteId]; // Start with note_id
      let paramCounter = 2; // Start from $2

      if (updates.title !== undefined) {
        updateFields.push(`title = $${paramCounter++}`);
        queryParams.push(updates.title);
      }

      if (updates.content !== undefined) {
        updateFields.push(`content = $${paramCounter++}`);
        queryParams.push(updates.content);
      }

      if (updates.source_url !== undefined) {
        updateFields.push(`source_url = $${paramCounter++}`);
        queryParams.push(updates.source_url);
      }

      if (updates.tags !== undefined) {
        updateFields.push(`tags = $${paramCounter++}`);
        queryParams.push(updates.tags);
      }

      if (updates.collection_id !== undefined) {
        // If collection_id is being changed, verify it exists and belongs to user
        const collectionCheck = await client.query(
          'SELECT id FROM collections WHERE id = $1 AND user_id = $2',
          [updates.collection_id, this.userId]
        );

        if (collectionCheck.rows.length === 0) {
          throw new Error('Collection not found or access denied');
        }

        updateFields.push(`collection_id = $${paramCounter++}`);
        queryParams.push(updates.collection_id);
      }

      // Always update the updated_at timestamp
      updateFields.push('updated_at = CURRENT_TIMESTAMP');

      if (updateFields.length === 0) {
        // Nothing to update
        await client.query('ROLLBACK');
        return note;
      }

      const query = `
        UPDATE notes
        SET ${updateFields.join(', ')}
        WHERE id = $1
        RETURNING *
      `;

      const noteResult = await client.query(query, queryParams);
      const updatedNote = noteResult.rows[0];

      // If title or content changed, update the embedding
      if (updates.title !== undefined || updates.content !== undefined) {
        const title = updates.title || note.title;
        const content = updates.content || note.content;
        
        const embedding = await this.generateEmbedding(`${title}\n\n${content}`);
        if (embedding) {
          // Convert JS array to pgvector literal '[v1,v2,...]'
          const vectorLiteral = `[${embedding.join(',')}]`;
          
          // Delete existing embedding if it exists
          await client.query('DELETE FROM note_vectors WHERE note_id = $1', [noteId]);
          
          // Insert new embedding
          await client.query(
            'INSERT INTO note_vectors (note_id, embedding) VALUES ($1, $2::vector)',
            [noteId, vectorLiteral]
          );
        }
      }

      // Update collection timestamp
      await client.query(
        'UPDATE collections SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [updatedNote.collection_id]
      );

      await client.query('COMMIT');
      return updatedNote;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async searchNotes(params) {
    const {
      searchQuery,
      searchMode = 'hybrid',
      collectionIds = null,
      recursive = false,
      tagFilter = null,
      limit = 20,
    } = params;

    const client = await this.pool.connect();
    try {
      let actualCollectionIds = collectionIds;
      
      // If recursive flag is true and we have collectionIds, get all child collection IDs as well
      if (recursive && collectionIds && collectionIds.length > 0) {
        actualCollectionIds = await this.getAllChildCollectionIds(client, collectionIds);
      }

      // Build join and where conditions separately to avoid duplicate aliases
      const joinCollections = 'JOIN collections c ON n.collection_id = c.id';
      let whereConditions = 'WHERE c.user_id = $1';
      let queryParams = [this.userId];
      let paramCount = 1;

      // Add collection filter
      if (actualCollectionIds && actualCollectionIds.length > 0) {
        paramCount++;
        whereConditions += ` AND n.collection_id = ANY($${paramCount})`;
        queryParams.push(actualCollectionIds);
      }

      // Add tag filter
      if (tagFilter && tagFilter.length > 0) {
        paramCount++;
        whereConditions += ` AND n.tags && $${paramCount}`;
        queryParams.push(tagFilter);
      }

      if (searchMode === 'keyword') {
        paramCount++;
        const query = `
          SELECT n.*, c.name as collection_name, ts_rank(to_tsvector('english', n.content), plainto_tsquery('english', $${paramCount})) as score
          FROM notes n
          ${joinCollections}
          ${whereConditions}
          AND to_tsvector('english', n.content) @@ plainto_tsquery('english', $${paramCount})
          ORDER BY score DESC
          LIMIT $${paramCount + 1}
        `;
        queryParams.push(searchQuery, limit);
        const result = await client.query(query, queryParams);
        return result.rows;

      } else if (searchMode === 'semantic') {
        const queryEmbedding = await this.generateEmbedding(searchQuery);
        if (!queryEmbedding) {
          throw new Error('Failed to generate query embedding');
        }

        const vectorLiteral = `[${queryEmbedding.join(',')}]`;
        paramCount++;
        const query = `
          SELECT n.*, c.name as collection_name, (1 - (v.embedding <=> $${paramCount}::vector)) as score
          FROM notes n
          JOIN note_vectors v ON n.id = v.note_id
          ${joinCollections}
          ${whereConditions}
          ORDER BY v.embedding <=> $${paramCount}::vector
          LIMIT $${paramCount + 1}
        `;
        queryParams.push(vectorLiteral, limit);
        const result = await client.query(query, queryParams);
        return result.rows;

      } else if (searchMode === 'hybrid') {
        const queryEmbedding = await this.generateEmbedding(searchQuery);
        if (!queryEmbedding) {
          // Fallback to keyword search
          return this.searchNotes({ ...params, searchMode: 'keyword' });
        }

        const vectorLiteral = `[${queryEmbedding.join(',')}]`;
        paramCount++;
        const textParam = paramCount;
        paramCount++;
        const vectorParam = paramCount;
        paramCount++;
        const limitParam = paramCount;

        const query = `
          WITH keyword_scores AS (
            SELECT n.id, ts_rank(to_tsvector('english', n.content), plainto_tsquery('english', $${textParam})) as keyword_score
            FROM notes n
            ${joinCollections}
            ${whereConditions}
            AND to_tsvector('english', n.content) @@ plainto_tsquery('english', $${textParam})
          ),
          semantic_scores AS (
            SELECT n.id, (1 - (v.embedding <=> $${vectorParam}::vector)) as semantic_score
            FROM notes n
            JOIN note_vectors v ON n.id = v.note_id
            ${joinCollections}
            ${whereConditions}
          )
          SELECT n.*, c.name as collection_name,
                 COALESCE(k.keyword_score * 0.3, 0) + COALESCE(s.semantic_score * 0.7, 0) as score
          FROM notes n
          ${joinCollections}
          ${whereConditions}
          LEFT JOIN keyword_scores k ON n.id = k.id
          LEFT JOIN semantic_scores s ON n.id = s.id
          WHERE (k.keyword_score IS NOT NULL OR s.semantic_score IS NOT NULL)
          ORDER BY score DESC
          LIMIT $${limitParam}
        `;
        queryParams.push(searchQuery, vectorLiteral, limit);
        const result = await client.query(query, queryParams);
        return result.rows;
      }

    } finally {
      client.release();
    }
  }

  async getAllChildCollectionIds(client, parentIds) {
    // This recursive CTE will get all descendant collections
    const query = `
      WITH RECURSIVE collection_tree AS (
        -- Base case: the specified collections
        SELECT id
        FROM collections
        WHERE id = ANY($1) AND user_id = $2
        
        UNION ALL
        
        -- Recursive case: child collections
        SELECT c.id
        FROM collections c
        JOIN collection_tree ct ON c.parent_id = ct.id
        WHERE c.user_id = $2
      )
      SELECT id FROM collection_tree
    `;

    const result = await client.query(query, [parentIds, this.userId]);
    return result.rows.map(row => row.id);
  }

  async deleteNote(noteId) {
    const client = await this.pool.connect();
    try {
      // Verify note belongs to user (through collection ownership)
      const result = await client.query(`
        DELETE FROM notes n
        USING collections c
        WHERE n.collection_id = c.id
        AND c.user_id = $1
        AND n.id = $2
        RETURNING n.*
      `, [this.userId, noteId]);

      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  async _call(args) {
    try {
      if (!this.userId) {
        return JSON.stringify({ error: 'User context not available' });
      }

      // Ensure database initialization complete
      await this.ready;

      const { action } = args;

      switch (action) {
        case 'create_collection': {
          const { 
            collection_name, 
            collection_description = '', 
            collection_tags = [], 
            parent_collection_id = null 
          } = args;
          
          if (!collection_name) {
            return JSON.stringify({ error: 'collection_name is required' });
          }
          
          const collection = await this.createCollection(
            collection_name, 
            collection_description, 
            collection_tags, 
            parent_collection_id
          );
          
          return JSON.stringify({
            success: true,
            collection: {
              id: collection.id,
              name: collection.name,
              description: collection.description,
              parent_id: collection.parent_id,
              tags: collection.tags,
              created_at: collection.created_at
            }
          });
        }

        case 'update_collection': {
          const { 
            collection_id,
            collection_name,
            collection_description,
            collection_tags,
            parent_collection_id
          } = args;
          
          if (!collection_id) {
            return JSON.stringify({ error: 'collection_id is required' });
          }
          
          const updates = {};
          if (collection_name !== undefined) updates.name = collection_name;
          if (collection_description !== undefined) updates.description = collection_description;
          if (collection_tags !== undefined) updates.tags = collection_tags;
          if (parent_collection_id !== undefined) updates.parent_id = parent_collection_id;
          
          const collection = await this.updateCollection(collection_id, updates);
          
          if (!collection) {
            return JSON.stringify({ error: 'No updates were made to the collection' });
          }
          
          return JSON.stringify({
            success: true,
            collection: {
              id: collection.id,
              name: collection.name,
              description: collection.description,
              parent_id: collection.parent_id,
              tags: collection.tags,
              updated_at: collection.updated_at
            }
          });
        }

        case 'delete_collection': {
          const { collection_id } = args;
          
          if (!collection_id) {
            return JSON.stringify({ error: 'collection_id is required' });
          }
          
          const deletedCollection = await this.deleteCollection(collection_id);
          
          if (!deletedCollection) {
            return JSON.stringify({ error: 'Collection not found or access denied' });
          }
          
          return JSON.stringify({
            success: true,
            message: 'Collection and all its contents deleted successfully',
            deleted_collection_id: collection_id
          });
        }

        case 'list_collections': {
          const { 
            parent_collection_id = null, 
            tag_filter, 
            limit = 50,
            recursive = false
          } = args;
          
          const collections = await this.listCollections({
            parentId: parent_collection_id,
            tagFilter: tag_filter,
            limit,
            recursive
          });
          
          return JSON.stringify({
            success: true,
            collections: collections.map(c => ({
              id: c.id,
              name: c.name,
              description: c.description,
              parent_id: c.parent_id,
              tags: c.tags,
              created_at: c.created_at,
              updated_at: c.updated_at,
              depth: c.depth // Only present for recursive queries
            }))
          });
        }

        case 'search_collections': {
          const { search_query, tag_filter, limit = 20 } = args;
          
          if (!search_query) {
            return JSON.stringify({ error: 'search_query is required' });
          }
          
          const collections = await this.searchCollections(search_query, tag_filter, limit);
          
          return JSON.stringify({
            success: true,
            collections: collections.map(c => ({
              id: c.id,
              name: c.name,
              description: c.description,
              parent_id: c.parent_id,
              tags: c.tags,
              score: c.score,
              created_at: c.created_at,
              updated_at: c.updated_at
            }))
          });
        }

        case 'add_note': {
          const { collection_id, note_title, note_content, note_source_url, note_tags = [] } = args;
          
          if (!collection_id || !note_title || !note_content) {
            return JSON.stringify({ error: 'collection_id, note_title, and note_content are required' });
          }
          
          const note = await this.addNote(collection_id, note_title, note_content, note_source_url, note_tags);
          
          return JSON.stringify({
            success: true,
            note: {
              id: note.id,
              collection_id: note.collection_id,
              title: note.title,
              content: note.content,
              source_url: note.source_url,
              tags: note.tags,
              created_at: note.created_at
            }
          });
        }

        case 'update_note': {
          const { 
            note_id, 
            note_title, 
            note_content,
            note_source_url,
            note_tags,
            collection_id
          } = args;
          
          if (!note_id) {
            return JSON.stringify({ error: 'note_id is required' });
          }
          
          const updates = {};
          if (note_title !== undefined) updates.title = note_title;
          if (note_content !== undefined) updates.content = note_content;
          if (note_source_url !== undefined) updates.source_url = note_source_url;
          if (note_tags !== undefined) updates.tags = note_tags;
          if (collection_id !== undefined) updates.collection_id = collection_id;
          
          const note = await this.updateNote(note_id, updates);
          
          return JSON.stringify({
            success: true,
            note: {
              id: note.id,
              collection_id: note.collection_id,
              title: note.title,
              content: note.content,
              source_url: note.source_url,
              tags: note.tags,
              updated_at: note.updated_at
            }
          });
        }

        case 'search_notes': {
          const { 
            search_query, 
            search_mode = 'hybrid', 
            collection_id, 
            tag_filter, 
            limit = 20,
            recursive = false
          } = args;
          
          if (!search_query) {
            return JSON.stringify({ error: 'search_query is required' });
          }

          const collectionIds = collection_id ? [collection_id] : null;
          const notes = await this.searchNotes({
            searchQuery: search_query,
            searchMode: search_mode,
            collectionIds,
            recursive,
            tagFilter: tag_filter,
            limit
          });

          return JSON.stringify({
            success: true,
            notes: notes.map(n => ({
              id: n.id,
              collection_id: n.collection_id,
              collection_name: n.collection_name,
              title: n.title,
              content: n.content,
              source_url: n.source_url,
              tags: n.tags,
              score: n.score,
              created_at: n.created_at
            })),
            search_mode: search_mode,
            query: search_query
          });
        }

        case 'delete_note': {
          const { note_id } = args;
          
          if (!note_id) {
            return JSON.stringify({ error: 'note_id is required' });
          }
          
          const deletedNote = await this.deleteNote(note_id);
          
          if (!deletedNote) {
            return JSON.stringify({ error: 'Note not found or access denied' });
          }
          
          return JSON.stringify({
            success: true,
            message: 'Note deleted successfully',
            deleted_note_id: note_id
          });
        }

        default:
          return JSON.stringify({ error: `Unknown action: ${action}` });
      }

    } catch (error) {
      logger.error('Collections tool error:', error);
      return JSON.stringify({ error: error.message });
    }
  }
}

module.exports = Collections;