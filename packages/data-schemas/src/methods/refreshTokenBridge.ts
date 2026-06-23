import type { Model } from 'mongoose';
import type {
  IRefreshTokenBridge,
  RefreshTokenBridgeCreateData,
  RefreshTokenBridgeQuery,
} from '~/types';
import logger from '~/config/winston';

function bridgeFilter({
  oldRefreshTokenHash,
  userId,
  tenantId,
}: RefreshTokenBridgeQuery): Record<string, unknown> {
  return {
    oldRefreshTokenHash,
    userId,
    tenantId: tenantId ?? { $exists: false },
  };
}

export function createRefreshTokenBridgeMethods(mongoose: typeof import('mongoose')): {
  upsertRefreshTokenBridge: (
    bridgeData: RefreshTokenBridgeCreateData,
  ) => Promise<IRefreshTokenBridge | null>;
  findRefreshTokenBridge: (query: RefreshTokenBridgeQuery) => Promise<IRefreshTokenBridge | null>;
  deleteRefreshTokenBridge: (query: RefreshTokenBridgeQuery) => Promise<{ deletedCount?: number }>;
} {
  async function upsertRefreshTokenBridge(
    bridgeData: RefreshTokenBridgeCreateData,
  ): Promise<IRefreshTokenBridge | null> {
    try {
      const RefreshTokenBridge = mongoose.models.RefreshTokenBridge as Model<IRefreshTokenBridge>;
      const filter = bridgeFilter(bridgeData);
      const update: {
        $set: Record<string, unknown>;
        $setOnInsert: Record<string, unknown>;
        $unset?: Record<string, string>;
      } = {
        $set: {
          encryptedNewRefreshToken: bridgeData.encryptedNewRefreshToken,
          expiresAt: bridgeData.expiresAt,
        },
        $setOnInsert: {
          oldRefreshTokenHash: bridgeData.oldRefreshTokenHash,
          userId: bridgeData.userId,
          ...(bridgeData.tenantId != null && { tenantId: bridgeData.tenantId }),
          createdAt: new Date(),
        },
      };
      if (bridgeData.openidIssuer != null) {
        update.$set.openidIssuer = bridgeData.openidIssuer;
      } else {
        update.$unset = { openidIssuer: '' };
      }
      return await RefreshTokenBridge.findOneAndUpdate(filter, update, {
        upsert: true,
        new: true,
      }).lean<IRefreshTokenBridge>();
    } catch (error) {
      logger.debug('[upsertRefreshTokenBridge] Error storing bridge:', error);
      throw error;
    }
  }

  async function findRefreshTokenBridge(
    query: RefreshTokenBridgeQuery,
  ): Promise<IRefreshTokenBridge | null> {
    try {
      const RefreshTokenBridge = mongoose.models.RefreshTokenBridge as Model<IRefreshTokenBridge>;
      return await RefreshTokenBridge.findOne({
        ...bridgeFilter(query),
        expiresAt: { $gt: new Date() },
      }).lean<IRefreshTokenBridge>();
    } catch (error) {
      logger.debug('[findRefreshTokenBridge] Error finding bridge:', error);
      throw error;
    }
  }

  async function deleteRefreshTokenBridge(
    query: RefreshTokenBridgeQuery,
  ): Promise<{ deletedCount?: number }> {
    try {
      const RefreshTokenBridge = mongoose.models.RefreshTokenBridge as Model<IRefreshTokenBridge>;
      const result = await RefreshTokenBridge.deleteOne(bridgeFilter(query));
      return { deletedCount: result.deletedCount };
    } catch (error) {
      logger.debug('[deleteRefreshTokenBridge] Error deleting bridge:', error);
      throw error;
    }
  }

  return {
    upsertRefreshTokenBridge,
    findRefreshTokenBridge,
    deleteRefreshTokenBridge,
  };
}

export type RefreshTokenBridgeMethods = ReturnType<typeof createRefreshTokenBridgeMethods>;
