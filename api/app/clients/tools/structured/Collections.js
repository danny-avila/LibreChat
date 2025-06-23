const { Tool } = require('@langchain/core/tools');
const { z } = require('zod');
const { logger } = require('@librechat/data-schemas');

// PostgreSQL client
const { Pool } = require('pg');

// For embeddings - using OpenAI API directly
const axios = require('axios');

// Built-in URL validation function
const { URL } = require('url');

class Collections extends Tool {
  constructor(fields = {}) {
    super();

    this.name = 'collections';
    this.description_for_model =
      'Allows the assistant to manage organized collections of notes, facts, sources, and information across sessions. You can create and organize collections in a hierarchical structure with parent-child relationships. Actions: create_collection, list_collections, search_collections, add_note, search_notes, delete_note, update_note, update_collection, delete_collection. Use add_note to store new information, search_notes to retrieve relevant information, organize collections hierarchically.';
    this.description =
      'Store and retrieve organized knowledge in collections with hierarchical structure. ' +
      'Actions: create_collection, list_collections, search_collections, add_note, search_notes, delete_note, update_note, update_collection, delete_collection. ' +
      'Supports keyword, semantic, and hybrid search across all notes. ' +
      'Perfect for maintaining organized information across multiple chat sessions.';

    this.schema = z.object({
      action: z.enum([
        'create_collection',
        'list_collections',
        'search_collections',
        'add_note',
        'search_notes',
        'delete_note',
        'update_note',
        'update_collection',
        'delete_collection',
      ]),
      collection_name: z.string().max(200).optional(),
      collection_description: z.string().max(2000).optional(),
      collection_tags: z.array(z.string().max(50)).max(20).optional(),
      collection_id: z.string().uuid().optional(),
      parent_collection_id: z.string().uuid().optional(),
      note_title: z.string().max(500).optional(),
      note_content: z.string().max(50000).optional(),
      note_source_url: z.string().url().max(1000).optional(),
      note_tags: z.array(z.string().max(50)).max(20).optional(),
      note_id: z.string().uuid().optional(),
      search_query: z.string().max(500).optional(),
      search_mode: z.enum(['keyword', 'semantic', 'hybrid']).optional(),
      limit: z.number().min(1).max(100).optional(),
      tag_filter: z.array(z.string().max(50)).max(20).optional(),
    });

    // Initialize properties from fields parameter
    this.userId = fields.userId || null;
    this.pool = null;
    // store promise so callers can await readiness before executing queries
    this.ready = this.initializeDatabase();
  }

  // Input sanitization methods
  sanitizeText(text) {
    if (!text || typeof text !== 'string') return text;

    // Remove null bytes and control characters except newlines, tabs, and carriage returns
    // eslint-disable-next-line no-control-regex
    return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
  }

  sanitizeUrl(url) {
    if (!url || typeof url !== 'string') return url;

    const sanitized = this.sanitizeText(url);

    // Basic URL validation using built-in URL constructor
    if (sanitized) {
      try {
        // Try to parse as URL - if it has a protocol
        if (sanitized.includes('://')) {
          new URL(sanitized);
        }
        // If no protocol, just validate it's not obviously malicious
        else if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]/.test(sanitized)) {
          logger.warn('Potentially invalid URL provided:', sanitized);
        }
      } catch (_e) {
        logger.warn('Invalid URL provided:', sanitized);
      }
    }

    return sanitized;
  }

  sanitizeArray(arr) {
    if (!Array.isArray(arr)) return arr;
    return arr.map((item) => this.sanitizeText(item)).filter((item) => item && item.length > 0);
  }

  sanitizeSearchQuery(query) {
    if (!query || typeof query !== 'string') return query;

    // Remove special PostgreSQL characters that could cause issues
    // but preserve basic search functionality
    return this.sanitizeText(query)
      .replace(/[\\';]/g, '') // Remove potential SQL injection chars
      .replace(/\s+/g, ' '); // Normalize whitespace
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
      await client.query(
        'CREATE INDEX IF NOT EXISTS idx_collections_user_id ON collections(user_id)',
      );
      await client.query(
        'CREATE INDEX IF NOT EXISTS idx_collections_parent_id ON collections(parent_id)',
      );
      await client.query(
        'CREATE INDEX IF NOT EXISTS idx_collections_tags ON collections USING GIN(tags)',
      );
      await client.query(
        'CREATE INDEX IF NOT EXISTS idx_notes_collection_id ON notes(collection_id)',
      );
      await client.query('CREATE INDEX IF NOT EXISTS idx_notes_tags ON notes USING GIN(tags)');
      await client.query(
        "CREATE INDEX IF NOT EXISTS idx_notes_content_fulltext ON notes USING GIN(to_tsvector('english', content))",
      );
      await client.query(
        'CREATE INDEX IF NOT EXISTS idx_note_vectors_embedding ON note_vectors USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)',
      );
    } finally {
      client.release();
    }
  }

  async generateEmbedding(text) {
    try {
      // Use OpenAI embeddings directly - no external service dependencies
      if (process.env.OPENAI_API_KEY) {
        const response = await axios.post(
          'https://api.openai.com/v1/embeddings',
          {
            input: text,
            model: 'text-embedding-3-small',
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json',
            },
            timeout: 15000,
          },
        );

        if (
          response.data &&
          response.data.data &&
          response.data.data[0] &&
          response.data.data[0].embedding
        ) {
          // Ensure embedding values are numbers, not strings
          const embedding = response.data.data[0].embedding;
          return embedding.map(val => typeof val === 'string' ? parseFloat(val) : val);
        } else {
          logger.error('OpenAI API returned invalid embedding response');
        }
      } else {
        logger.error('No OpenAI API key configured for embeddings');
      }

      return null;
    } catch (error) {
      logger.error('Failed to generate embedding:', error.message || error);
      return null;
    }
  }

  async createCollection(name, description = '', tags = [], parentId = null) {
    const client = await this.pool.connect();
    try {
      // Sanitize inputs
      const sanitizedName = this.sanitizeText(name);
      const sanitizedDescription = this.sanitizeText(description);
      const sanitizedTags = this.sanitizeArray(tags);

      if (!sanitizedName) {
        throw new Error('Collection name is required and cannot be empty');
      }

      // If parent_id is provided, verify it exists and belongs to user
      if (parentId) {
        const parentCheck = await client.query(
          'SELECT id FROM collections WHERE id = $1 AND user_id = $2',
          [parentId, this.userId],
        );

        if (parentCheck.rows.length === 0) {
          throw new Error('Parent collection not found or access denied');
        }
      }

      const result = await client.query(
        'INSERT INTO collections (user_id, name, description, tags, parent_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [this.userId, sanitizedName, sanitizedDescription, sanitizedTags, parentId],
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
        [collectionId, this.userId],
      );

      if (collectionCheck.rows.length === 0) {
        throw new Error('Collection not found or access denied');
      }

      // Build the update query dynamically based on which fields are provided
      const updateFields = [];
      const queryParams = [collectionId]; // Start with collection_id
      let paramCounter = 2; // Start from $2

      if (updates.name !== undefined) {
        const sanitizedName = this.sanitizeText(updates.name);
        if (!sanitizedName) {
          throw new Error('Collection name cannot be empty');
        }
        updateFields.push(`name = $${paramCounter++}`);
        queryParams.push(sanitizedName);
      }

      if (updates.description !== undefined) {
        const sanitizedDescription = this.sanitizeText(updates.description);
        updateFields.push(`description = $${paramCounter++}`);
        queryParams.push(sanitizedDescription);
      }

      if (updates.tags !== undefined) {
        const sanitizedTags = this.sanitizeArray(updates.tags);
        updateFields.push(`tags = $${paramCounter++}`);
        queryParams.push(sanitizedTags);
      }

      if (updates.parent_id !== undefined) {
        // If parent_id is being set, verify it exists and belongs to user
        if (updates.parent_id) {
          const parentCheck = await client.query(
            'SELECT id FROM collections WHERE id = $1 AND user_id = $2',
            [updates.parent_id, this.userId],
          );

          if (parentCheck.rows.length === 0) {
            throw new Error('Parent collection not found or access denied');
          }

          // Prevent circular references
          const isCircular = await this.wouldCreateCircularReference(
            client,
            collectionId,
            updates.parent_id,
          );
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
      const result = await client.query('SELECT parent_id FROM collections WHERE id = $1', [
        currentId,
      ]);

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
        [collectionId, this.userId],
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
      const result = await client.query('DELETE FROM collections WHERE id = $1 RETURNING *', [
        collectionId,
      ]);

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
    const { parentId = null, tagFilter = null, limit = 50, recursive = false } = params;

    const client = await this.pool.connect();
    try {
      // Sanitize inputs
      const sanitizedTagFilter = tagFilter ? this.sanitizeArray(tagFilter) : null;

      // If recursive is true and parentId is provided, we need to get all descendants
      if (recursive && parentId) {
        return this.listCollectionsRecursive(client, parentId, sanitizedTagFilter, limit);
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

      if (sanitizedTagFilter && sanitizedTagFilter.length > 0) {
        query += ` AND tags && $${paramIndex++}`;
        queryParams.push(sanitizedTagFilter);
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
    // Sanitize inputs
    const sanitizedTagFilter = tagFilter ? this.sanitizeArray(tagFilter) : null;

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

    if (sanitizedTagFilter && sanitizedTagFilter.length > 0) {
      query += ` WHERE tags && $${paramIndex++}`;
      params.push(sanitizedTagFilter);
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
      // Sanitize inputs
      const sanitizedSearchQuery = this.sanitizeSearchQuery(searchQuery);
      const sanitizedTagFilter = tagFilter ? this.sanitizeArray(tagFilter) : null;

      if (!sanitizedSearchQuery) {
        throw new Error('Search query cannot be empty');
      }

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

      let params = [sanitizedSearchQuery, this.userId, `%${sanitizedSearchQuery}%`];
      let paramIndex = 4;

      if (sanitizedTagFilter && sanitizedTagFilter.length > 0) {
        query += ` AND tags && $${paramIndex++}`;
        params.push(sanitizedTagFilter);
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

      // Sanitize inputs
      const sanitizedTitle = this.sanitizeText(title);
      const sanitizedContent = this.sanitizeText(content);
      const sanitizedSourceUrl = sourceUrl ? this.sanitizeUrl(sourceUrl) : null;
      const sanitizedTags = this.sanitizeArray(tags);

      if (!sanitizedTitle) {
        throw new Error('Note title is required and cannot be empty');
      }

      if (!sanitizedContent) {
        throw new Error('Note content is required and cannot be empty');
      }

      // Verify collection belongs to user
      const collectionCheck = await client.query(
        'SELECT id FROM collections WHERE id = $1 AND user_id = $2',
        [collectionId, this.userId],
      );

      if (collectionCheck.rows.length === 0) {
        throw new Error('Collection not found or access denied');
      }

      // Insert note
      const noteResult = await client.query(
        'INSERT INTO notes (collection_id, title, content, source_url, tags) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [collectionId, sanitizedTitle, sanitizedContent, sanitizedSourceUrl, sanitizedTags],
      );

      const note = noteResult.rows[0];

      // Generate and store embedding
      const embedding = await this.generateEmbedding(`${title}\n\n${content}`);
      if (embedding) {
        // Use direct SQL insert for vector - pgvector has issues with prepared statements
        await client.query(
          `INSERT INTO note_vectors (note_id, embedding) VALUES ('${note.id}', '[${embedding.join(',')}]')`
        );
        logger.debug(`Embedding stored for note ${note.id}`);
      } else {
        logger.warn(
          `Failed to generate embedding for note ${note.id} - semantic search will not include this note`,
        );
      }

      // Update collection timestamp
      await client.query('UPDATE collections SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [
        collectionId,
      ]);

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
      const noteCheck = await client.query(
        `
        SELECT n.* 
        FROM notes n
        JOIN collections c ON n.collection_id = c.id
        WHERE n.id = $1 AND c.user_id = $2
      `,
        [noteId, this.userId],
      );

      if (noteCheck.rows.length === 0) {
        throw new Error('Note not found or access denied');
      }

      const note = noteCheck.rows[0];
      const updateFields = [];
      const queryParams = [noteId]; // Start with note_id
      let paramCounter = 2; // Start from $2

      if (updates.title !== undefined) {
        const sanitizedTitle = this.sanitizeText(updates.title);
        if (!sanitizedTitle) {
          throw new Error('Note title cannot be empty');
        }
        updateFields.push(`title = $${paramCounter++}`);
        queryParams.push(sanitizedTitle);
      }

      if (updates.content !== undefined) {
        const sanitizedContent = this.sanitizeText(updates.content);
        if (!sanitizedContent) {
          throw new Error('Note content cannot be empty');
        }
        updateFields.push(`content = $${paramCounter++}`);
        queryParams.push(sanitizedContent);
      }

      if (updates.source_url !== undefined) {
        const sanitizedSourceUrl = updates.source_url ? this.sanitizeUrl(updates.source_url) : null;
        updateFields.push(`source_url = $${paramCounter++}`);
        queryParams.push(sanitizedSourceUrl);
      }

      if (updates.tags !== undefined) {
        const sanitizedTags = this.sanitizeArray(updates.tags);
        updateFields.push(`tags = $${paramCounter++}`);
        queryParams.push(sanitizedTags);
      }

      if (updates.collection_id !== undefined) {
        // If collection_id is being changed, verify it exists and belongs to user
        const collectionCheck = await client.query(
          'SELECT id FROM collections WHERE id = $1 AND user_id = $2',
          [updates.collection_id, this.userId],
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
          // Delete existing embedding if it exists
          await client.query('DELETE FROM note_vectors WHERE note_id = $1', [noteId]);

          // Insert new embedding using direct SQL - pgvector has issues with prepared statements
          await client.query(
            `INSERT INTO note_vectors (note_id, embedding) VALUES ('${noteId}', '[${embedding.join(',')}]')`
          );
        }
      }

      // Update collection timestamp
      await client.query('UPDATE collections SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [
        updatedNote.collection_id,
      ]);

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
      // Sanitize inputs
      const sanitizedSearchQuery = this.sanitizeSearchQuery(searchQuery);
      const sanitizedTagFilter = tagFilter ? this.sanitizeArray(tagFilter) : null;

      if (!sanitizedSearchQuery) {
        throw new Error('Search query cannot be empty');
      }

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
      if (sanitizedTagFilter && sanitizedTagFilter.length > 0) {
        paramCount++;
        whereConditions += ` AND n.tags && $${paramCount}`;
        queryParams.push(sanitizedTagFilter);
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
        queryParams.push(sanitizedSearchQuery, limit);
        const result = await client.query(query, queryParams);
        return result.rows;
      } else if (searchMode === 'semantic') {
        const queryEmbedding = await this.generateEmbedding(sanitizedSearchQuery);
        if (!queryEmbedding) {
          // Fallback to keyword search when embeddings fail
          logger.warn('Semantic search failed, falling back to keyword search');
          return this.searchNotes({ ...params, searchMode: 'keyword' });
        }

        paramCount++;
        const query = `
          SELECT n.*, c.name as collection_name, 
                 CASE 
                   WHEN v.embedding IS NOT NULL THEN (1 - (v.embedding <=> '[${queryEmbedding.join(',')}]'))
                   ELSE 0
                 END as score
          FROM notes n
          LEFT JOIN note_vectors v ON n.id = v.note_id
          ${joinCollections}
          ${whereConditions}
          ORDER BY score DESC, n.created_at DESC
          LIMIT $${paramCount}
        `;
        queryParams.push(limit);
        const result = await client.query(query, queryParams);
        return result.rows;
      } else if (searchMode === 'hybrid') {
        const queryEmbedding = await this.generateEmbedding(sanitizedSearchQuery);
        if (!queryEmbedding) {
          // Fallback to keyword search
          return this.searchNotes({ ...params, searchMode: 'keyword' });
        }

        // Build WHERE clause for CTEs based on existing conditions
        let cteWhereClause = 'WHERE c.user_id = $1';
        if (actualCollectionIds && actualCollectionIds.length > 0) {
          const collectionParam = queryParams.findIndex((p) => p === actualCollectionIds) + 1;
          cteWhereClause += ` AND n.collection_id = ANY($${collectionParam})`;
        }
        if (sanitizedTagFilter && sanitizedTagFilter.length > 0) {
          const tagParam = queryParams.findIndex((p) => p === sanitizedTagFilter) + 1;
          cteWhereClause += ` AND n.tags && $${tagParam}`;
        }

        paramCount++;
        const textParam = paramCount;
        paramCount++;
        const limitParam = paramCount;

        const query = `
          WITH keyword_scores AS (
            SELECT n.id, ts_rank(to_tsvector('english', n.content), plainto_tsquery('english', $${textParam})) as keyword_score
            FROM notes n
            JOIN collections c ON n.collection_id = c.id
            ${cteWhereClause}
            AND to_tsvector('english', n.content) @@ plainto_tsquery('english', $${textParam})
          ),
          semantic_scores AS (
            SELECT n.id, (1 - (v.embedding <=> '[${queryEmbedding.join(',')}]')) as semantic_score
            FROM notes n
            JOIN collections c ON n.collection_id = c.id
            LEFT JOIN note_vectors v ON n.id = v.note_id
            ${cteWhereClause}
            AND v.embedding IS NOT NULL
          )
          SELECT n.*, c.name as collection_name,
                 COALESCE(k.keyword_score * 0.3, 0) + COALESCE(s.semantic_score * 0.7, 0) as score
          FROM notes n
          ${joinCollections}
          LEFT JOIN keyword_scores k ON n.id = k.id
          LEFT JOIN semantic_scores s ON n.id = s.id
          ${whereConditions}
          AND (k.keyword_score IS NOT NULL OR s.semantic_score IS NOT NULL)
          ORDER BY score DESC
          LIMIT $${limitParam}
        `;
        queryParams.push(sanitizedSearchQuery, limit);
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
    return result.rows.map((row) => row.id);
  }

  async deleteNote(noteId) {
    const client = await this.pool.connect();
    try {
      // Verify note belongs to user (through collection ownership)
      const result = await client.query(
        `
        DELETE FROM notes n
        USING collections c
        WHERE n.collection_id = c.id
        AND c.user_id = $1
        AND n.id = $2
        RETURNING n.*
      `,
        [this.userId, noteId],
      );

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
            parent_collection_id = null,
          } = args;

          if (!collection_name) {
            return JSON.stringify({ error: 'collection_name is required' });
          }

          const collection = await this.createCollection(
            collection_name,
            collection_description,
            collection_tags,
            parent_collection_id,
          );

          return JSON.stringify({
            success: true,
            message: 'Collection created successfully',
            id: collection.id,
            created_at: collection.created_at,
          });
        }

        case 'update_collection': {
          const {
            collection_id,
            collection_name,
            collection_description,
            collection_tags,
            parent_collection_id,
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
            message: 'Collection updated successfully',
            id: collection.id,
            updated_at: collection.updated_at,
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
            deleted_collection_id: collection_id,
          });
        }

        case 'list_collections': {
          const { parent_collection_id = null, tag_filter, limit = 50, recursive = false } = args;

          const collections = await this.listCollections({
            parentId: parent_collection_id,
            tagFilter: tag_filter,
            limit,
            recursive,
          });

          return JSON.stringify({
            success: true,
            collections: collections.map((c) => ({
              id: c.id,
              name: c.name,
              description: c.description,
              parent_id: c.parent_id,
              tags: c.tags,
              created_at: c.created_at,
              updated_at: c.updated_at,
              depth: c.depth, // Only present for recursive queries
            })),
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
            collections: collections.map((c) => ({
              id: c.id,
              name: c.name,
              description: c.description,
              parent_id: c.parent_id,
              tags: c.tags,
              score: c.score,
              created_at: c.created_at,
              updated_at: c.updated_at,
            })),
          });
        }

        case 'add_note': {
          const { collection_id, note_title, note_content, note_source_url, note_tags = [] } = args;

          if (!collection_id || !note_title || !note_content) {
            return JSON.stringify({
              error: 'collection_id, note_title, and note_content are required',
            });
          }

          const note = await this.addNote(
            collection_id,
            note_title,
            note_content,
            note_source_url,
            note_tags,
          );

          return JSON.stringify({
            success: true,
            message: 'Note added successfully',
            id: note.id,
            created_at: note.created_at,
          });
        }

        case 'update_note': {
          const { note_id, note_title, note_content, note_source_url, note_tags, collection_id } =
            args;

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
            message: 'Note updated successfully',
            id: note.id,
            updated_at: note.updated_at,
          });
        }

        case 'search_notes': {
          const {
            search_query,
            search_mode = 'hybrid',
            collection_id,
            tag_filter,
            limit = 20,
            recursive = false,
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
            limit,
          });

          return JSON.stringify({
            success: true,
            notes: notes.map((n) => ({
              id: n.id,
              collection_id: n.collection_id,
              collection_name: n.collection_name,
              title: n.title,
              content: n.content,
              source_url: n.source_url,
              tags: n.tags,
              score: n.score,
              created_at: n.created_at,
            })),
            search_mode: search_mode,
            query: search_query,
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
            deleted_note_id: note_id,
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
