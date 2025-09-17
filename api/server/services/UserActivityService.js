const { logger } = require('~/config');
const { User, UserActivityLog } = require('~/db/models');
const {
  getTokenUsageForModelChange,
  fetchActivityLogs,
} = require('~/server/controllers/UserActivityController');
const { initSubscriber, publishActivity } = require('./BackPlane');

class UserActivityService {
  constructor() {
    this.clients = new Map(); // Connected SSE clients
    this.activityBuffer = []; // Local buffer of activities
    this.maxBufferSize = 100;

    // Initialize Redis subscriber for cross-instance communication
    initSubscriber(async (activityData) => {
      try {
        await this.broadcastActivity(activityData, false); // fromRedis = false
      } catch (e) {
        logger.error('[UserActivityService] Redis rebroadcast failed:', e);
      }
    });
  }

  /**
   * Register a new SSE client
   */
  async addClient(clientId, res, userRole = 'USER', options = {}) {
    this.clients.set(clientId, {
      response: res,
      role: userRole,
      connectedAt: new Date(),
      options,
    });

    // Confirm connection
    res.write(`event: connected\n`);
    res.write(
      `data: ${JSON.stringify({
        message: 'SSE connection established',
        clientId,
      })}\n\n`,
    );

    // Send initial snapshot
    try {
      logger.info(
        `[UserActivityService] Fetching initial snapshot for client ${clientId} with options:`,
        options,
      );
      const { logs, pagination } = await fetchActivityLogs(options);
      logger.info(
        `[UserActivityService] Initial snapshot for client ${clientId}: ${logs.length} logs found`,
      );

      if (logs.length === 0) {
        logger.warn(
          `[UserActivityService] No logs found in initial snapshot for client ${clientId}`,
        );
      }

      this.sendToClient(
        clientId,
        { success: true, data: { logs, pagination } },
        'activity',
      );
    } catch (err) {
      logger.error(
        `[UserActivityService] Failed initial snapshot for ${clientId}:`,
        err,
      );
      const logs = this.activityBuffer.slice(-10);
      logger.info(
        `[UserActivityService] Using fallback buffer for client ${clientId}: ${logs.length} logs`,
      );

      const pagination = {
        currentPage: 1,
        totalPages: 1,
        totalCount: logs.length,
        hasNext: false,
        hasPrev: false,
      };
      this.sendToClient(
        clientId,
        { success: true, data: { logs, pagination } },
        'activity',
      );
    }

    logger.info(
      `[UserActivityService] Client ${clientId} connected (role=${userRole})`,
    );
  }

  removeClient(clientId) {
    if (this.clients.has(clientId)) {
      this.clients.delete(clientId);
      logger.info(`[UserActivityService] Client ${clientId} disconnected`);
    }
  }

  sendToClient(clientId, payload, eventName = 'activity') {
    const client = this.clients.get(clientId);
    if (!client || !client.response) return;
    try {
      client.response.write(`event: ${eventName}\n`);
      client.response.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch (error) {
      logger.error(
        `[UserActivityService] Failed to send to client ${clientId}:`,
        error,
      );
      this.removeClient(clientId);
    }
  }

  /**
   * Broadcast an activity to local SSE clients
   */
  async broadcastActivity(activityData, fromLocal = true) {
    try {
      this.activityBuffer.push(activityData);
      if (this.activityBuffer.length > this.maxBufferSize)
        this.activityBuffer.shift();

      const userInfo = await User.findById(activityData.user)
        .select('name email username avatar role')
        .lean();

      const isModelChange =
        ['MODEL CHANGED', 'MODEL CHNAGED'].includes(activityData.action) &&
        activityData.details?.conversationId;

      const anyWantsToken = Array.from(this.clients.values()).some(
        (c) =>
          c.role === 'ADMIN' &&
          `${c.options?.includeTokenUsage ?? 'true'}` === 'true',
      );

      let precomputedTokenUsage = null;
      if (isModelChange && anyWantsToken) {
        precomputedTokenUsage = await getTokenUsageForModelChange(
          activityData.user,
          activityData.details.conversationId,
          activityData.details.fromModel,
          activityData.details.toModel,
          activityData.timestamp,
        );
      }

      for (const [clientId, client] of this.clients) {
        if (client.role !== 'ADMIN') continue;

        const includeTokenUsage =
          `${client.options?.includeTokenUsage ?? 'true'}` === 'true';

        const enrichedLog = {
          ...activityData,
          userInfo,
          tokenUsage:
            includeTokenUsage && precomputedTokenUsage
              ? { ...activityData.details, ...precomputedTokenUsage }
              : ['MODEL CHANGED', 'MODEL CHNAGED'].includes(activityData.action)
              ? activityData.details
              : null,
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
              hasPrev: false,
            },
          },
        };

        this.sendToClient(clientId, payload, 'activity');
      }

      logger.debug(
        `[UserActivityService] Broadcasted activity to ${this.clients.size} clients`,
      );
    } catch (error) {
      logger.error('[UserActivityService] Failed to broadcast activity:', error);
    }
  }

  getConnectedClientsCount() {
    return this.clients.size;
  }

  cleanupInactiveClients() {
    const now = new Date();
    const timeout = 5 * 60 * 1000; // 5 min
    for (const [clientId, client] of this.clients) {
      if (now - client.connectedAt > timeout) this.removeClient(clientId);
    }
  }

  sendHeartbeat() {
    const payload = { ping: Date.now() };
    for (const [clientId] of this.clients) {
      this.sendToClient(clientId, payload, 'heartbeat');
    }
  }
}

const userActivityService = new UserActivityService();

// Periodic maintenance
setInterval(
  () => userActivityService.cleanupInactiveClients(),
  5 * 60 * 1000,
);
setInterval(() => userActivityService.sendHeartbeat(), 30 * 1000);

// Log + broadcast (local and cross-instance)
const logAndBroadcastActivity = async (userId, action, details = null) => {
  try {
    const activityLog = await UserActivityLog.create({
      user: userId,
      action,
      timestamp: new Date(),
      details,
    });

    const payload = {
      _id: activityLog._id,
      user: userId,
      action,
      timestamp: activityLog.timestamp,
      details,
      createdAt: activityLog.createdAt,
      updatedAt: activityLog.updatedAt,
      __v: activityLog.__v,
    };

    // Publish to Redis for cross-instance communication
    await publishActivity(payload);

    // Local broadcast
    await userActivityService.broadcastActivity(payload, true);

    return activityLog;
  } catch (error) {
    logger.error('[logAndBroadcastActivity] Error:', error);
    throw error;
  }
};

module.exports = {
  userActivityService,
  logAndBroadcastActivity,
};
