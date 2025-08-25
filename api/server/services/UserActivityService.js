const { logger } = require('~/config');
const { UserActivityLog } = require('~/db/models');
const { getTokenUsageForModelChange } = require('~/server/controllers/UserActivityController');

class UserActivityService {
  constructor() {
    this.clients = new Map(); // Store connected clients
    this.activityBuffer = []; // Buffer for recent activities
    this.maxBufferSize = 100;
  }

  /**
   * Add a client for real-time updates
   */
  async addClient(clientId, res, userRole = 'USER') {
    this.clients.set(clientId, {
      response: res,
      role: userRole,
      connectedAt: new Date()
    });

    // Send initial connection confirmation
    this.sendToClient(clientId, {
      type: 'connection',
      message: 'Connected to user activity stream',
      timestamp: new Date()
    });

    // Send all historical activity logs for admin users
    if (userRole === 'ADMIN') {
      try {
        // Fetch all activity logs from database, sorted by timestamp (newest first)
        const allActivities = await UserActivityLog.find({})
          .sort({ timestamp: -1 })
          .limit(1000) // Limit to last 1000 activities to prevent overwhelming
          .lean();

        if (allActivities.length > 0) {
          this.sendToClient(clientId, {
            type: 'historical_data',
            data: allActivities,
            count: allActivities.length,
            message: `Loaded ${allActivities.length} historical activities`,
            timestamp: new Date()
          });
        }
      } catch (error) {
        logger.error(`[UserActivityService] Failed to load historical data for client ${clientId}:`, error);
        // Fallback to buffer data
        if (this.activityBuffer.length > 0) {
          this.sendToClient(clientId, {
            type: 'initial_data',
            data: this.activityBuffer.slice(-10),
            timestamp: new Date()
          });
        }
      }
    } else {
      // For non-admin users, send recent buffer only
      if (this.activityBuffer.length > 0) {
        this.sendToClient(clientId, {
          type: 'initial_data',
          data: this.activityBuffer.slice(-10),
          timestamp: new Date()
        });
      }
    }

    logger.info(`[UserActivityService] Client ${clientId} connected for real-time updates`);
  }

  /**
   * Remove a client
   */
  removeClient(clientId) {
    if (this.clients.has(clientId)) {
      this.clients.delete(clientId);
      logger.info(`[UserActivityService] Client ${clientId} disconnected`);
    }
  }

  /**
   * Send data to a specific client
   */
  sendToClient(clientId, data) {
    const client = this.clients.get(clientId);
    if (client && client.response) {
      try {
        client.response.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch (error) {
        logger.error(`[UserActivityService] Failed to send to client ${clientId}:`, error);
        this.removeClient(clientId);
      }
    }
  }

  /**
   * Broadcast activity to all connected clients
   */
  async broadcastActivity(activityData) {
    try {
      // Add to buffer
      this.activityBuffer.push(activityData);
      if (this.activityBuffer.length > this.maxBufferSize) {
        this.activityBuffer.shift(); // Remove oldest
      }

      // Enrich with token usage if it's a model change
      let enrichedData = { ...activityData };
      if (activityData.action === 'MODEL CHANGED' && activityData.details?.conversationId) {
        const tokenStats = await getTokenUsageForModelChange(
          activityData.user,
          activityData.details.conversationId,
          activityData.details.fromModel,
          activityData.details.toModel,
          activityData.timestamp
        );
        enrichedData.tokenUsage = tokenStats;
      }

      // Broadcast to all connected clients
      const broadcastData = {
        type: 'activity_update',
        data: enrichedData,
        timestamp: new Date()
      };

      for (const [clientId, client] of this.clients) {
        // Only send to admin users for now (can be customized)
        if (client.role === 'ADMIN') {
          this.sendToClient(clientId, broadcastData);
        }
      }

      logger.debug(`[UserActivityService] Broadcasted activity to ${this.clients.size} clients`);
    } catch (error) {
      logger.error('[UserActivityService] Failed to broadcast activity:', error);
    }
  }

  /**
   * Get connected clients count
   */
  getConnectedClientsCount() {
    return this.clients.size;
  }

  /**
   * Clean up inactive clients
   */
  cleanupInactiveClients() {
    const now = new Date();
    const timeout = 5 * 60 * 1000; // 5 minutes

    for (const [clientId, client] of this.clients) {
      if (now - client.connectedAt > timeout) {
        this.removeClient(clientId);
      }
    }
  }

  /**
   * Send periodic heartbeat to maintain connections
   */
  sendHeartbeat() {
    const heartbeatData = {
      type: 'heartbeat',
      timestamp: new Date(),
      connectedClients: this.clients.size
    };

    for (const [clientId] of this.clients) {
      this.sendToClient(clientId, heartbeatData);
    }
  }
}

// Singleton instance
const userActivityService = new UserActivityService();

// Cleanup inactive clients every 5 minutes
setInterval(() => {
  userActivityService.cleanupInactiveClients();
}, 5 * 60 * 1000);

// Send heartbeat every 30 seconds
setInterval(() => {
  userActivityService.sendHeartbeat();
}, 30 * 1000);

/**
 * Middleware to log user activity and broadcast in real-time
 */
const logAndBroadcastActivity = async (userId, action, details = null) => {
  try {
    const activityLog = await UserActivityLog.create({
      user: userId,
      action,
      timestamp: new Date(),
      details
    });

    // Broadcast to connected clients
    await userActivityService.broadcastActivity({
      _id: activityLog._id,
      user: userId,
      action,
      timestamp: activityLog.timestamp,
      details
    });

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
