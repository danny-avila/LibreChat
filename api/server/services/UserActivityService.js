// ~/server/services/UserActivityService.js
const { logger } = require('~/config');
const { User, UserActivityLog } = require('~/db/models');
const { getTokenUsageForModelChange, fetchActivityLogs } = require('~/server/controllers/UserActivityController');
// NEW: backplane
const { initSubscriber, publishActivity } = require('~/server/services/BackPlane');

class UserActivityService {
  constructor() {
    this.clients = new Map();
    this.activityBuffer = [];
    this.maxBufferSize = 100;

    // Listen for cross-instance events via Redis (if configured)
    initSubscriber(async (activityData) => {
      try {
        // Rebroadcast to our connected SSE clients
        await this.broadcastActivity(activityData);
      } catch (e) {
        logger.error('[UserActivityService] Backplane rebroadcast failed:', e);
      }
    });
  }

  async addClient(clientId, res, userRole = 'USER', options = {}) {
    this.clients.set(clientId, {
      response: res,
      role: userRole,
      connectedAt: new Date(),
      options
    });

    try {
      const { logs, pagination } = await fetchActivityLogs(options);
      this.sendToClient(clientId, { success: true, data: { logs, pagination } });
    } catch (err) {
      logger.error(`[UserActivityService] Failed initial snapshot for ${clientId}:`, err);
      const logs = this.activityBuffer.slice(-10);
      const pagination = { currentPage: 1, totalPages: 1, totalCount: logs.length, hasNext: false, hasPrev: false };
      this.sendToClient(clientId, { success: true, data: { logs, pagination } });
    }

    logger.info(`[UserActivityService] Client ${clientId} connected (role=${userRole})`);
  }

  removeClient(clientId) {
    if (this.clients.has(clientId)) {
      this.clients.delete(clientId);
      logger.info(`[UserActivityService] Client ${clientId} disconnected`);
    }
  }

  sendToClient(clientId, payload) {
    const client = this.clients.get(clientId);
    if (!client || !client.response) return;
    try {
      client.response.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch (error) {
      logger.error(`[UserActivityService] Failed to send to client ${clientId}:`, error);
      this.removeClient(clientId);
    }
  }

  async broadcastActivity(activityData) {
    try {
      this.activityBuffer.push(activityData);
      if (this.activityBuffer.length > this.maxBufferSize) this.activityBuffer.shift();

      const userInfo = await User.findById(activityData.user)
        .select('name email username avatar role')
        .lean();

      const isModelChange = ['MODEL CHANGED', 'MODEL CHNAGED'].includes(activityData.action)
        && activityData.details?.conversationId;

      const anyWantsToken = Array.from(this.clients.values())
        .some(c => c.role === 'ADMIN' && (`${c.options?.includeTokenUsage ?? 'true'}` === 'true'));

      let precomputedTokenUsage = null;
      if (isModelChange && anyWantsToken) {
        precomputedTokenUsage = await getTokenUsageForModelChange(
          activityData.user,
          activityData.details.conversationId,
          activityData.details.fromModel,
          activityData.details.toModel,
          activityData.timestamp
        );
      }

      for (const [clientId, client] of this.clients) {
        if (client.role !== 'ADMIN') continue;

        const includeTokenUsage = `${client.options?.includeTokenUsage ?? 'true'}` === 'true';

        const enrichedLog = {
          ...activityData,
          userInfo,
          tokenUsage: (includeTokenUsage && precomputedTokenUsage)
            ? { ...activityData.details, ...precomputedTokenUsage }
            : (['MODEL CHANGED', 'MODEL CHNAGED'].includes(activityData.action) ? activityData.details : null),
        };

        const payload = {
          success: true,
          data: {
            logs: [enrichedLog],
            pagination: {
              currentPage: 1,
              totalPages: 1,
              totalCount: 1,
              hasNext: false,
              hasPrev: false
            }
          }
        };

        this.sendToClient(clientId, payload);
      }

      logger.debug(`[UserActivityService] Broadcasted activity to ${this.clients.size} clients`);
    } catch (error) {
      logger.error('[UserActivityService] Failed to broadcast activity:', error);
    }
  }

  getConnectedClientsCount() {
    return this.clients.size;
  }

  cleanupInactiveClients() {
    const now = new Date();
    const timeout = 5 * 60 * 1000;
    for (const [clientId, client] of this.clients) {
      if (now - client.connectedAt > timeout) this.removeClient(clientId);
    }
  }

  sendHeartbeat() {
    const payload = {
      success: true,
      data: {
        logs: [],
        pagination: { currentPage: 1, totalPages: 1, totalCount: 0, hasNext: false, hasPrev: false }
      }
    };
    for (const [clientId] of this.clients) {
      this.sendToClient(clientId, payload);
    }
  }
}

const userActivityService = new UserActivityService();

setInterval(() => userActivityService.cleanupInactiveClients(), 5 * 60 * 1000);
setInterval(() => userActivityService.sendHeartbeat(), 30 * 1000);

// Publish to Redis in addition to local broadcast
const logAndBroadcastActivity = async (userId, action, details = null) => {
  try {
    const activityLog = await UserActivityLog.create({
      user: userId,
      action,
      timestamp: new Date(),
      details
    });

    const payload = {
      _id: activityLog._id,
      user: userId,
      action,
      timestamp: activityLog.timestamp,
      details,
      createdAt: activityLog.createdAt,
      updatedAt: activityLog.updatedAt,
      __v: activityLog.__v
    };

    // Local clients
    await userActivityService.broadcastActivity(payload);
    // Cross-instance clients
    await publishActivity(payload);

    return activityLog;
  } catch (error) {
    logger.error('[logAndBroadcastActivity] Error:', error);
    throw error;
  }
};

module.exports = {
  userActivityService,
  logAndBroadcastActivity
};
