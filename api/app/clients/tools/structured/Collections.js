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
    const description =
      'Store and retrieve organized knowledge in collections with hierarchical structure. ' +
      'Actions: create_collection, list_collections, search_collections, add_note, bulk_add_notes, search_notes, delete_note, update_note, update_collection, delete_collection. ' +
      'Supports keyword, semantic, and hybrid search across all notes. ' +
      'Perfect for maintaining organized information across multiple chat sessions.';

    const schema = z.object({
      action: z.enum([
        'create_collection',
        'list_collections',
        'search_collections',
        'add_note',
        'bulk_add_notes',
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
      notes: z
        .array(
          z.object({
            title: z.string().max(500),
            content: z.string().max(50000),
            source_url: z.string().url().max(1000).optional(),
            tags: z.array(z.string().max(50)).max(20).optional(),
          }),
        )
        .max(100)
        .optional(),
      note_id: z.string().uuid().optional(),
      search_query: z.string().max(500).optional(),
      search_mode: z.enum(['keyword', 'semantic', 'hybrid']).optional(),
      return_mode: z.enum(['lite', 'full']).optional(),
      limit: z.number().min(1).max(100).optional(),
      tag_filter: z.array(z.string().max(50)).max(20).optional(),
      recursive: z.boolean().optional(),
    });

    super({ name: 'collections', description, schema });

    this.name = 'collections';
    this.description_for_model =
      'Allows the assistant to manage organized collections of notes, facts, sources, and information across sessions. You can create and organize collections in a hierarchical structure with parent-child relationships. Actions: create_collection, list_collections, search_collections, add_note, bulk_add_notes, search_notes, delete_note, update_note, update_collection, delete_collection. Use add_note to store single notes, bulk_add_notes to create multiple notes at once, search_notes to retrieve relevant information with return_mode "lite" (default, excludes content/tags) or "full" (includes all fields), organize collections hierarchically.';
    this.description = description;
    this.schema = schema;

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
    if (!sanitized) return sanitized;

    // Allowed protocols
    const allowedProtocols = ['http:', 'https:', 'ftp:', 'mailto:'];

    try {
      let parsedUrl;

      // If URL has no protocol, try adding https://
      if (!sanitized.includes('://')) {
        parsedUrl = new URL('https://' + sanitized);
      } else {
        parsedUrl = new URL(sanitized);
      }

      // Check if protocol is allowed
      if (!allowedProtocols.includes(parsedUrl.protocol)) {
        logger.warn(`Blocked URL with disallowed protocol: ${parsedUrl.protocol}`, sanitized);
        return null;
      }

      // Additional checks for suspicious patterns
      if (
        parsedUrl.protocol === 'javascript:' ||
        sanitized.toLowerCase().includes('javascript:') ||
        sanitized.toLowerCase().includes('data:') ||
        sanitized.toLowerCase().includes('vbscript:')
      ) {
        logger.warn('Blocked potentially malicious URL:', sanitized);
        return null;
      }

      return sanitized;
    } catch (error) {
      logger.warn('Invalid URL provided:', sanitized, error.message);
      return null;
    }
  }

  sanitizeArray(arr) {
    if (!Array.isArray(arr)) return arr;

    const originalLength = arr.length;
    const sanitized = arr
      .map((item) => this.sanitizeText(item))
      .filter((item) => item && item.length > 0);

    if (sanitized.length < originalLength) {
      const droppedCount = originalLength - sanitized.length;
      logger.warn(
        `sanitizeArray: ${droppedCount} item(s) were dropped due to being empty or invalid`,
      );
    }

    return sanitized;
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
        port: Number(process.env.POSTGRES_PORT) || 5432,
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

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      logger.debug('Collections database connection pool closed');
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
          parent_id UUID REFERENCES collections(id) ON DELETE CASCADE,
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

      // Analyze the note_vectors table to make the ivfflat index usable
      await client.query('ANALYZE note_vectors;');
    } finally {
      client.release();
    }
  }

  async generateEmbedding(text) {
    try {
      // Truncate text to handle OpenAI token limits
      // text-embedding-3-small has a limit of 8192 tokens
      // Rough approximation: 1 token ≈ 4 characters, so limit to ~30000 chars to be safe
      const maxChars = 30000;
      let processedText = text;
      if (text && text.length > maxChars) {
        processedText = text.substring(0, maxChars);
        logger.warn(
          `Text truncated from ${text.length} to ${maxChars} characters for embedding generation`,
        );
      }

      // Use OpenAI embeddings directly - no external service dependencies
      if (process.env.OPENAI_API_KEY) {
        const response = await axios.post(
          'https://api.openai.com/v1/embeddings',
          {
            input: processedText,
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
          return embedding.map((val) => (typeof val === 'string' ? parseFloat(val) : val));
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

    // Use a recursive CTE to check for circular references in one query
    const query = `
      WITH RECURSIVE parent_chain AS (
        -- Base case: start with the proposed parent
        SELECT id, parent_id, 0 as depth
        FROM collections
        WHERE id = $1
        
        UNION ALL
        
        -- Recursive case: follow the parent chain upward
        SELECT c.id, c.parent_id, pc.depth + 1
        FROM collections c
        JOIN parent_chain pc ON c.id = pc.parent_id
        WHERE pc.depth < 100  -- Prevent infinite recursion in case of existing cycles
      )
      SELECT COUNT(*) as cycle_count
      FROM parent_chain
      WHERE id = $2;
    `;

    const result = await client.query(query, [parentId, collectionId]);

    // If collectionId appears in the parent chain, it would create a cycle
    return parseInt(result.rows[0].cycle_count) > 0;
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

  // Helper method to get parent collection name
  async getParentCollectionName(client, parentId) {
    if (!parentId) return null;
    
    const result = await client.query(
      'SELECT name FROM collections WHERE id = $1 AND user_id = $2',
      [parentId, this.userId]
    );
    
    return result.rows.length > 0 ? result.rows[0].name : null;
  }

  // Helper method to build full path for a collection
  async buildCollectionPath(client, collectionId) {
    if (!collectionId) return '';
    
    const path = [];
    let currentId = collectionId;
    
    while (currentId) {
      const result = await client.query(
        'SELECT name, parent_id FROM collections WHERE id = $1 AND user_id = $2',
        [currentId, this.userId]
      );
      
      if (result.rows.length === 0) break;
      
      const collection = result.rows[0];
      path.unshift(collection.name);
      currentId = collection.parent_id;
    }
    
    return path.join(' / ');
  }

  // Helper method to build full path for multiple collections efficiently
  async buildCollectionPaths(client, collections) {
    const paths = {};
    const parentNames = {};
    
    // Get all unique parent IDs
    const parentIds = [...new Set(collections.map(c => c.parent_id).filter(id => id))];
    
    // Batch fetch parent names
    if (parentIds.length > 0) {
      const placeholders = parentIds.map((_, i) => `$${i + 2}`).join(',');
      const result = await client.query(
        `SELECT id, name FROM collections WHERE id IN (${placeholders}) AND user_id = $1`,
        [this.userId, ...parentIds]
      );
      
      result.rows.forEach(row => {
        parentNames[row.id] = row.name;
      });
    }
    
    // Build paths for each collection
    for (const collection of collections) {
      if (collection.parent_id) {
        parentNames[collection.id] = parentNames[collection.parent_id] || null;
        
        // Build path by traversing up the hierarchy
        const path = [];
        let currentId = collection.id;
        
        while (currentId) {
          const currentCollection = collections.find(c => c.id === currentId) || 
                                  (currentId === collection.id ? collection : null);
          
          if (!currentCollection) {
            // Fetch from database if not in current result set
            const dbResult = await client.query(
              'SELECT name, parent_id FROM collections WHERE id = $1 AND user_id = $2',
              [currentId, this.userId]
            );
            
            if (dbResult.rows.length === 0) break;
            
            path.unshift(dbResult.rows[0].name);
            currentId = dbResult.rows[0].parent_id;
          } else {
            path.unshift(currentCollection.name);
            currentId = currentCollection.parent_id;
          }
        }
        
        paths[collection.id] = path.join(' / ');
      } else {
        paths[collection.id] = collection.name;
        parentNames[collection.id] = null;
      }
    }
    
    return { paths, parentNames };
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
      let query = `
        SELECT c.*, 
               p.name as parent_name
        FROM collections c
        LEFT JOIN collections p ON c.parent_id = p.id
        WHERE c.user_id = $1
      `;
      let queryParams = [this.userId];
      let paramIndex = 2;

      if (parentId === null) {
        // Get only top-level collections (no parent)
        query += ' AND c.parent_id IS NULL';
      } else {
        // Get children of a specific collection
        query += ` AND c.parent_id = $${paramIndex++}`;
        queryParams.push(parentId);
      }

      if (sanitizedTagFilter && sanitizedTagFilter.length > 0) {
        query += ` AND c.tags && $${paramIndex++}`;
        queryParams.push(sanitizedTagFilter);
      }

      query += ' ORDER BY c.updated_at DESC';

      if (limit) {
        query += ` LIMIT $${paramIndex++}`;
        queryParams.push(limit);
      }

      const result = await client.query(query, queryParams);
      const collections = result.rows;
      
      // Build full paths for all collections
      const { paths } = await this.buildCollectionPaths(client, collections);
      
      // Add full_path to each collection
      return collections.map(collection => ({
        ...collection,
        full_path: paths[collection.id] || collection.name
      }));
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
        SELECT c.*, 0 AS depth, c.name as path_names
        FROM collections c
        WHERE c.id = $1 AND c.user_id = $2
        
        UNION ALL
        
        -- Recursive case: child collections
        SELECT c.*, ct.depth + 1, ct.path_names || ' / ' || c.name
        FROM collections c
        JOIN collection_tree ct ON c.parent_id = ct.id
        WHERE c.user_id = $2
      )
      SELECT ct.*, p.name as parent_name
      FROM collection_tree ct
      LEFT JOIN collections p ON ct.parent_id = p.id
    `;

    let params = [parentId, this.userId];
    let paramIndex = 3;

    // Build WHERE clause for tag filtering
    const whereConditions = [];
    if (sanitizedTagFilter && sanitizedTagFilter.length > 0) {
      whereConditions.push(`ct.tags && $${paramIndex++}`);
      params.push(sanitizedTagFilter);
    }

    if (whereConditions.length > 0) {
      query += ` WHERE ${whereConditions.join(' AND ')}`;
    }

    query += ' ORDER BY ct.depth, ct.updated_at DESC';

    if (limit) {
      query += ` LIMIT $${paramIndex++}`;
      params.push(limit);
    }

    const result = await client.query(query, params);
    const collections = result.rows;
    
    // Add full_path field (using the path_names from CTE)
    return collections.map(collection => ({
      ...collection,
      full_path: collection.path_names || collection.name
    }));
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
        SELECT c.*, 
               p.name as parent_name,
               ts_rank(to_tsvector('english', c.name || ' ' || c.description), plainto_tsquery('english', $1)) as score
        FROM collections c
        LEFT JOIN collections p ON c.parent_id = p.id
        WHERE c.user_id = $2
        AND (
          to_tsvector('english', c.name || ' ' || c.description) @@ plainto_tsquery('english', $1)
          OR c.name ILIKE $3
          OR c.description ILIKE $3
        )
      `;

      let params = [sanitizedSearchQuery, this.userId, `%${sanitizedSearchQuery}%`];
      let paramIndex = 4;

      if (sanitizedTagFilter && sanitizedTagFilter.length > 0) {
        query += ` AND c.tags && $${paramIndex++}`;
        params.push(sanitizedTagFilter);
      }

      query += ' ORDER BY score DESC';

      if (limit) {
        query += ` LIMIT $${paramIndex++}`;
        params.push(limit);
      }

      const result = await client.query(query, params);
      const collections = result.rows;
      
      // Build full paths for all collections
      const { paths } = await this.buildCollectionPaths(client, collections);
      
      // Add full_path to each collection
      return collections.map(collection => ({
        ...collection,
        full_path: paths[collection.id] || collection.name
      }));
    } finally {
      client.release();
    }
  }

  // Helper method to add collection path to a single note
  async addCollectionPathToNote(client, note) {
    if (!note || !note.collection_id) return note;
    
    const collectionPath = await this.buildCollectionPath(client, note.collection_id);
    return {
      ...note,
      collection_path: collectionPath
    };
  }

  // Helper method to add collection paths to multiple notes efficiently
  async addCollectionPathsToNotes(client, notes) {
    if (!notes || notes.length === 0) return notes;
    
    // Get all unique collection IDs
    const collectionIds = [...new Set(notes.map(note => note.collection_id).filter(id => id))];
    
    // Build paths for all collections at once
    const paths = {};
    for (const collectionId of collectionIds) {
      paths[collectionId] = await this.buildCollectionPath(client, collectionId);
    }
    
    // Add paths to each note
    return notes.map(note => ({
      ...note,
      collection_path: note.collection_id ? (paths[note.collection_id] || '') : ''
    }));
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
        // Use parameterized query for embedding insertion
        await client.query('INSERT INTO note_vectors (note_id, embedding) VALUES ($1, $2)', [
          note.id,
          `[${embedding.join(',')}]`,
        ]);
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
      
      // Add collection path to the returned note
      return await this.addCollectionPathToNote(client, note);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async bulkAddNotes(collectionId, notes) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Verify collection belongs to user
      const collectionCheck = await client.query(
        'SELECT id FROM collections WHERE id = $1 AND user_id = $2',
        [collectionId, this.userId],
      );

      if (collectionCheck.rows.length === 0) {
        throw new Error('Collection not found or access denied');
      }

      const createdNotes = [];
      const failedNotes = [];

      for (let i = 0; i < notes.length; i++) {
        const noteData = notes[i];

        try {
          // Sanitize inputs for each note
          const sanitizedTitle = this.sanitizeText(noteData.title);
          const sanitizedContent = this.sanitizeText(noteData.content);
          const sanitizedSourceUrl = noteData.source_url
            ? this.sanitizeUrl(noteData.source_url)
            : null;
          const sanitizedTags = this.sanitizeArray(noteData.tags || []);

          if (!sanitizedTitle) {
            throw new Error('Note title is required and cannot be empty');
          }

          if (!sanitizedContent) {
            throw new Error('Note content is required and cannot be empty');
          }

          // Insert note
          const noteResult = await client.query(
            'INSERT INTO notes (collection_id, title, content, source_url, tags) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [collectionId, sanitizedTitle, sanitizedContent, sanitizedSourceUrl, sanitizedTags],
          );

          const note = noteResult.rows[0];

          // Generate and store embedding
          const embedding = await this.generateEmbedding(
            `${noteData.title}\n\n${noteData.content}`,
          );
          if (embedding) {
            await client.query('INSERT INTO note_vectors (note_id, embedding) VALUES ($1, $2)', [
              note.id,
              `[${embedding.join(',')}]`,
            ]);
            logger.debug(`Embedding stored for note ${note.id}`);
          } else {
            logger.warn(
              `Failed to generate embedding for note ${note.id} - semantic search will not include this note`,
            );
          }

          createdNotes.push(note);
        } catch (noteError) {
          logger.error(`Failed to create note ${i + 1}:`, noteError);
          failedNotes.push({
            index: i + 1,
            title: noteData.title,
            error: noteError.message,
          });
        }
      }

      // Update collection timestamp if any notes were created
      if (createdNotes.length > 0) {
        await client.query('UPDATE collections SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [
          collectionId,
        ]);
      }

      await client.query('COMMIT');

      // Add collection paths to created notes
      const notesWithPaths = await this.addCollectionPathsToNotes(client, createdNotes);

      return {
        createdNotes: notesWithPaths,
        failedNotes,
        totalRequested: notes.length,
        totalCreated: createdNotes.length,
        totalFailed: failedNotes.length,
      };
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
        return await this.addCollectionPathToNote(client, note);
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

          // Insert new embedding using parameterized query
          await client.query('INSERT INTO note_vectors (note_id, embedding) VALUES ($1, $2)', [
            noteId,
            `[${embedding.join(',')}]`,
          ]);
        }
      }

      // Update collection timestamp
      await client.query('UPDATE collections SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [
        updatedNote.collection_id,
      ]);

      await client.query('COMMIT');
      
      // Add collection path to the returned note
      return await this.addCollectionPathToNote(client, updatedNote);
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
      returnMode = 'lite',
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
        const selectFields =
          returnMode === 'lite'
            ? 'n.id, n.collection_id, n.title, n.source_url, n.created_at, c.name as collection_name'
            : 'n.*, c.name as collection_name';
        const scoreField =
          returnMode === 'lite'
            ? "ts_rank(to_tsvector('english', n.content), plainto_tsquery('english', $" +
              paramCount +
              ')) as score'
            : "ts_rank(to_tsvector('english', n.content), plainto_tsquery('english', $" +
              paramCount +
              ')) as score';

        const query = `
          SELECT ${selectFields}, ${scoreField}
          FROM notes n
          ${joinCollections}
          ${whereConditions}
          AND to_tsvector('english', n.content) @@ plainto_tsquery('english', $${paramCount})
          ORDER BY score DESC
          LIMIT $${paramCount + 1}
        `;
        queryParams.push(sanitizedSearchQuery, limit);
        const result = await client.query(query, queryParams);
        const notes = result.rows;
        
        // Add collection paths to notes
        return await this.addCollectionPathsToNotes(client, notes);
      } else if (searchMode === 'semantic') {
        const queryEmbedding = await this.generateEmbedding(sanitizedSearchQuery);
        if (!queryEmbedding) {
          // Fallback to keyword search when embeddings fail
          logger.warn('Semantic search failed, falling back to keyword search');
          return this.searchNotes({ ...params, searchMode: 'keyword' });
        }

        paramCount++;
        const selectFields =
          returnMode === 'lite'
            ? 'n.id, n.collection_id, n.title, n.source_url, n.created_at, c.name as collection_name'
            : 'n.*, c.name as collection_name';

        const query = `
          SELECT ${selectFields}, 
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
        const notes = result.rows;
        
        // Add collection paths to notes
        return await this.addCollectionPathsToNotes(client, notes);
      } else if (searchMode === 'hybrid') {
        const queryEmbedding = await this.generateEmbedding(sanitizedSearchQuery);
        if (!queryEmbedding) {
          // Fallback to keyword search
          return this.searchNotes({ ...params, searchMode: 'keyword' });
        }

        // Build WHERE clause for CTEs based on existing conditions
        let cteWhereClause = 'WHERE c.user_id = $1';
        let cteParamCount = 1;

        if (actualCollectionIds && actualCollectionIds.length > 0) {
          cteParamCount++;
          cteWhereClause += ` AND n.collection_id = ANY($${cteParamCount})`;
        }
        if (sanitizedTagFilter && sanitizedTagFilter.length > 0) {
          cteParamCount++;
          cteWhereClause += ` AND n.tags && $${cteParamCount}`;
        }

        paramCount++;
        const textParam = paramCount;
        paramCount++;
        const limitParam = paramCount;

        const selectFields =
          returnMode === 'lite'
            ? 'n.id, n.collection_id, n.title, n.source_url, n.created_at, c.name as collection_name'
            : 'n.*, c.name as collection_name';

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
          SELECT ${selectFields},
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
        const notes = result.rows;
        
        // Add collection paths to notes
        return await this.addCollectionPathsToNotes(client, notes);
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
      // Validate input arguments against schema
      const validatedArgs = this.schema.parse(args);

      if (!this.userId) {
        return JSON.stringify({ error: 'User context not available' });
      }

      // Ensure database initialization complete
      await this.ready;

      const { action } = validatedArgs;

      switch (action) {
        case 'create_collection': {
          const {
            collection_name,
            collection_description = '',
            collection_tags = [],
            parent_collection_id = null,
          } = validatedArgs;

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
          } = validatedArgs;

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
          const { collection_id } = validatedArgs;

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

        case 'bulk_add_notes': {
          const { collection_id, notes } = args;

          if (!collection_id || !notes || !Array.isArray(notes) || notes.length === 0) {
            return JSON.stringify({
              error: 'collection_id and notes array are required, and notes must not be empty',
            });
          }

          const result = await this.bulkAddNotes(collection_id, notes);

          return JSON.stringify({
            success: true,
            message: `Bulk note creation completed: ${result.totalCreated} created, ${result.totalFailed} failed`,
            total_requested: result.totalRequested,
            total_created: result.totalCreated,
            total_failed: result.totalFailed,
            created_notes: result.createdNotes.map((note) => ({
              id: note.id,
              title: note.title,
              created_at: note.created_at,
            })),
            failed_notes: result.failedNotes,
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
            return_mode = 'lite',
            collection_id,
            tag_filter,
            limit = 20,
            recursive = false,
          } = validatedArgs;

          if (!search_query) {
            return JSON.stringify({ error: 'search_query is required' });
          }

          const collectionIds = collection_id ? [collection_id] : null;
          const notes = await this.searchNotes({
            searchQuery: search_query,
            searchMode: search_mode,
            returnMode: return_mode,
            collectionIds,
            recursive,
            tagFilter: tag_filter,
            limit,
          });

          // Map results based on return mode
          const mappedNotes =
            return_mode === 'lite'
              ? notes.map((n) => ({
                  id: n.id,
                  collection_id: n.collection_id,
                  collection_name: n.collection_name,
                  title: n.title,
                  source_url: n.source_url,
                  score: n.score,
                  created_at: n.created_at,
                }))
              : notes.map((n) => ({
                  id: n.id,
                  collection_id: n.collection_id,
                  collection_name: n.collection_name,
                  title: n.title,
                  content: n.content,
                  source_url: n.source_url,
                  tags: n.tags,
                  score: n.score,
                  created_at: n.created_at,
                }));

          return JSON.stringify({
            success: true,
            notes: mappedNotes,
            search_mode: search_mode,
            return_mode: return_mode,
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
