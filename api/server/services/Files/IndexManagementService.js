const { logger } = require('~/config');
const mongoose = require('mongoose');

/**
 * Index Management Service for MongoDB collections
 * Ensures proper indexes are created for optimal performance
 */
class IndexManagementService {
  constructor() {
    this.indexesEnsured = new Set();
  }

  /**
   * Ensure indexes for DownloadToken collection
   */
  async ensureDownloadTokenIndexes() {
    try {
      const DownloadToken = mongoose.models.DownloadToken;
      if (!DownloadToken) {
        logger.debug('[IndexManagement] DownloadToken model not found, skipping index creation');
        return;
      }

      const collection = DownloadToken.collection;
      const collectionName = collection.collectionName;

      if (this.indexesEnsured.has(collectionName)) {
        logger.debug(`[IndexManagement] Indexes already ensured for ${collectionName}`);
        return;
      }

      logger.info(`[IndexManagement] Ensuring indexes for ${collectionName} collection`);

      // Get existing indexes
      const existingIndexes = await collection.indexes();
      const existingIndexNames = existingIndexes.map(idx => idx.name);

      logger.debug(`[IndexManagement] Found ${existingIndexes.length} existing indexes:`, existingIndexNames);

      // Define additional indexes that might not be created by Mongoose schema
      const additionalIndexes = [
        {
          key: { userId: 1, createdAt: -1 },
          name: 'userId_1_createdAt_-1',
          options: { background: true }
        },
        {
          key: { userId: 1, expiresAt: 1, used: 1 },
          name: 'userId_1_expiresAt_1_used_1',
          options: { background: true }
        },
        {
          key: { fileId: 1, createdAt: -1 },
          name: 'fileId_1_createdAt_-1',
          options: { background: true }
        },
        {
          key: { clientIP: 1, createdAt: -1 },
          name: 'clientIP_1_createdAt_-1',
          options: { background: true }
        },
        {
          key: { used: 1, downloadedAt: -1 },
          name: 'used_1_downloadedAt_-1',
          options: { background: true }
        },
        {
          key: { singleUse: 1, used: 1, expiresAt: 1 },
          name: 'singleUse_1_used_1_expiresAt_1',
          options: { background: true }
        },
        {
          key: { downloadedAt: -1 },
          name: 'downloadedAt_-1_sparse',
          options: { background: true, sparse: true }
        },
        {
          key: { mcpClientId: 1, expiresAt: 1 },
          name: 'mcpClientId_1_expiresAt_1_sparse',
          options: { background: true, sparse: true }
        }
      ];

      // Create missing indexes
      let createdCount = 0;
      for (const indexSpec of additionalIndexes) {
        if (!existingIndexNames.includes(indexSpec.name)) {
          try {
            await collection.createIndex(indexSpec.key, {
              name: indexSpec.name,
              ...indexSpec.options
            });
            logger.info(`[IndexManagement] Created index: ${indexSpec.name}`);
            createdCount++;
          } catch (error) {
            if (error.code === 85) { // IndexOptionsConflict
              logger.debug(`[IndexManagement] Index ${indexSpec.name} already exists with different options`);
            } else {
              logger.error(`[IndexManagement] Failed to create index ${indexSpec.name}:`, error);
            }
          }
        }
      }

      // Ensure TTL index exists
      const ttlIndexExists = existingIndexes.some(idx =>
        idx.key && idx.key.expiresAt === 1 && idx.expireAfterSeconds !== undefined
      );

      if (!ttlIndexExists) {
        try {
          // Check if there's an existing expiresAt index without TTL
          const existingExpiresAtIndex = existingIndexes.find(idx =>
            idx.key && idx.key.expiresAt === 1 && idx.expireAfterSeconds === undefined
          );

          if (existingExpiresAtIndex) {
            // Drop the existing index first
            await collection.dropIndex(existingExpiresAtIndex.name);
            logger.info(`[IndexManagement] Dropped existing non-TTL index: ${existingExpiresAtIndex.name}`);
          }

          await collection.createIndex(
            { expiresAt: 1 },
            {
              name: 'expiresAt_1_ttl',
              expireAfterSeconds: 0,
              background: true
            }
          );
          logger.info('[IndexManagement] Created TTL index for automatic token cleanup');
          createdCount++;
        } catch (error) {
          if (error.code === 85) { // IndexOptionsConflict
            logger.debug('[IndexManagement] TTL index already exists with different options');
          } else {
            logger.error('[IndexManagement] Failed to create TTL index:', error);
          }
        }
      }

      this.indexesEnsured.add(collectionName);
      logger.info(`[IndexManagement] Index management completed for ${collectionName}. Created: ${createdCount} indexes`);

    } catch (error) {
      logger.error('[IndexManagement] Failed to ensure DownloadToken indexes:', error);
    }
  }

  /**
   * Ensure indexes for DownloadAuditLog collection
   */
  async ensureAuditLogIndexes() {
    try {
      // Check if AuditService has created the model
      const AuditLog = mongoose.models.DownloadAuditLog;
      if (!AuditLog) {
        logger.debug('[IndexManagement] DownloadAuditLog model not found, skipping index creation');
        return;
      }

      const collection = AuditLog.collection;
      const collectionName = collection.collectionName;

      if (this.indexesEnsured.has(collectionName)) {
        logger.debug(`[IndexManagement] Indexes already ensured for ${collectionName}`);
        return;
      }

      logger.info(`[IndexManagement] Ensuring indexes for ${collectionName} collection`);

      // Get existing indexes
      const existingIndexes = await collection.indexes();
      const existingIndexNames = existingIndexes.map(idx => idx.name);

      // Define audit log indexes
      const auditIndexes = [
        {
          key: { eventType: 1, timestamp: -1 },
          name: 'eventType_1_timestamp_-1',
          options: { background: true }
        },
        {
          key: { userId: 1, timestamp: -1 },
          name: 'userId_1_timestamp_-1',
          options: { background: true }
        },
        {
          key: { clientIP: 1, timestamp: -1 },
          name: 'clientIP_1_timestamp_-1',
          options: { background: true }
        },
        {
          key: { success: 1, timestamp: -1 },
          name: 'success_1_timestamp_-1',
          options: { background: true }
        }
      ];

      // Create missing indexes
      let createdCount = 0;
      for (const indexSpec of auditIndexes) {
        if (!existingIndexNames.includes(indexSpec.name)) {
          try {
            await collection.createIndex(indexSpec.key, {
              name: indexSpec.name,
              ...indexSpec.options
            });
            logger.info(`[IndexManagement] Created audit index: ${indexSpec.name}`);
            createdCount++;
          } catch (error) {
            if (error.code === 85) { // IndexOptionsConflict
              logger.debug(`[IndexManagement] Audit index ${indexSpec.name} already exists with different options`);
            } else {
              logger.error(`[IndexManagement] Failed to create audit index ${indexSpec.name}:`, error);
            }
          }
        }
      }

      this.indexesEnsured.add(collectionName);
      logger.info(`[IndexManagement] Audit index management completed for ${collectionName}. Created: ${createdCount} indexes`);

    } catch (error) {
      logger.error('[IndexManagement] Failed to ensure audit log indexes:', error);
    }
  }

  /**
   * Ensure all temporary download related indexes
   */
  async ensureAllIndexes() {
    try {
      logger.info('[IndexManagement] Starting index management for temporary downloads');

      // Run index creation sequentially to avoid timing issues
      await this.ensureDownloadTokenIndexes();
      await this.ensureAuditLogIndexes();

      logger.info('[IndexManagement] All temporary download indexes ensured');
    } catch (error) {
      logger.error('[IndexManagement] Failed to ensure all indexes:', error);
      throw error; // Re-throw to let caller handle
    }
  }

  /**
   * Get index information for a collection
   */
  async getIndexInfo(collectionName) {
    try {
      const db = mongoose.connection.db;
      const collection = db.collection(collectionName);
      
      const indexes = await collection.indexes();
      const stats = await collection.stats();

      return {
        collectionName,
        indexCount: indexes.length,
        indexes: indexes.map(idx => ({
          name: idx.name,
          key: idx.key,
          unique: idx.unique || false,
          sparse: idx.sparse || false,
          ttl: idx.expireAfterSeconds !== undefined,
          background: idx.background || false
        })),
        documentCount: stats.count,
        storageSize: stats.storageSize,
        indexSize: stats.totalIndexSize
      };
    } catch (error) {
      logger.error(`[IndexManagement] Failed to get index info for ${collectionName}:`, error);
      return null;
    }
  }

  /**
   * Get comprehensive index status
   */
  async getIndexStatus() {
    try {
      const collections = ['downloadtokens', 'downloadauditlogs'];
      const status = {};

      for (const collectionName of collections) {
        const info = await this.getIndexInfo(collectionName);
        if (info) {
          status[collectionName] = info;
        }
      }

      return {
        ensuredCollections: Array.from(this.indexesEnsured),
        collections: status,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('[IndexManagement] Failed to get index status:', error);
      return {
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Force re-creation of indexes (for development/testing)
   */
  async recreateIndexes() {
    try {
      logger.warn('[IndexManagement] Force recreating indexes - this should only be used in development');
      
      this.indexesEnsured.clear();
      await this.ensureAllIndexes();
      
      logger.info('[IndexManagement] Index recreation completed');
    } catch (error) {
      logger.error('[IndexManagement] Failed to recreate indexes:', error);
      throw error;
    }
  }
}

// Create singleton instance
const indexManagementService = new IndexManagementService();

module.exports = indexManagementService;
