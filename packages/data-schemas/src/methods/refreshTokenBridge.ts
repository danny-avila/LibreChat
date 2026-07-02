import type { FilterQuery, Model, UpdateQuery } from 'mongoose';
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
}: RefreshTokenBridgeQuery): FilterQuery<IRefreshTokenBridge> {
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
} {
  const getRefreshTokenBridgeModel = () =>
    mongoose.models.RefreshTokenBridge as Model<IRefreshTokenBridge>;

  async function upsertRefreshTokenBridge(
    bridgeData: RefreshTokenBridgeCreateData,
  ): Promise<IRefreshTokenBridge | null> {
    try {
      const RefreshTokenBridge = getRefreshTokenBridgeModel();
      const filter = bridgeFilter(bridgeData);
      const update: UpdateQuery<IRefreshTokenBridge> = {
        $set: {
          encryptedNewRefreshToken: bridgeData.encryptedNewRefreshToken,
          expiresAt: bridgeData.expiresAt,
          ...(bridgeData.openidIssuer != null && { openidIssuer: bridgeData.openidIssuer }),
        },
        $setOnInsert: {
          oldRefreshTokenHash: bridgeData.oldRefreshTokenHash,
          userId: bridgeData.userId,
          ...(bridgeData.tenantId != null && { tenantId: bridgeData.tenantId }),
          createdAt: new Date(),
        },
        ...(bridgeData.openidIssuer == null && { $unset: { openidIssuer: '' } }),
      };
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
      const RefreshTokenBridge = getRefreshTokenBridgeModel();
      return await RefreshTokenBridge.findOne({
        ...bridgeFilter(query),
        expiresAt: { $gt: new Date() },
      }).lean<IRefreshTokenBridge>();
    } catch (error) {
      logger.debug('[findRefreshTokenBridge] Error finding bridge:', error);
      throw error;
    }
  }

  return {
    upsertRefreshTokenBridge,
    findRefreshTokenBridge,
  };
}

export type RefreshTokenBridgeMethods = ReturnType<typeof createRefreshTokenBridgeMethods>;
