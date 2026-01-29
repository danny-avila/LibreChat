const crypto = require('node:crypto');
const { keyvRedisClient, cacheConfig, math } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');

const LEADER_KEY = `${cacheConfig.REDIS_KEY_PREFIX}${cacheConfig.GLOBAL_PREFIX_SEPARATOR}ScheduledTasksLeaderUUID`;
const LEADER_LEASE_DURATION = math(process.env.SCHEDULED_TASKS_LEADER_LEASE_DURATION, 25);
const LEADER_RENEW_INTERVAL = math(process.env.SCHEDULED_TASKS_LEADER_RENEW_INTERVAL, 10);
const LEADER_RENEW_ATTEMPTS = math(process.env.SCHEDULED_TASKS_LEADER_RENEW_ATTEMPTS, 3);
const LEADER_RENEW_RETRY_DELAY = math(process.env.SCHEDULED_TASKS_LEADER_RENEW_RETRY_DELAY, 0.5);

class ScheduledTasksLeader {
  constructor() {
    this.UUID = crypto.randomUUID();
    this.refreshTimer = undefined;

    process.on('SIGTERM', () => this.resign());
    process.on('SIGINT', () => this.resign());
  }

  async isLeader() {
    if (!cacheConfig.USE_REDIS) {
      return true;
    }

    if (!keyvRedisClient) {
      return false;
    }

    try {
      const currentLeader = await keyvRedisClient.get(LEADER_KEY);
      if (currentLeader === this.UUID) {
        return this.refreshTimer != null;
      }
      if (currentLeader != null) {
        return false;
      }

      const delay = Math.random() * 2000;
      await new Promise((resolve) => setTimeout(resolve, delay));
      return await this.electSelf();
    } catch (error) {
      logger.error('[ScheduledTasksLeader] Failed to check leadership status:', error);
      return false;
    }
  }

  async resign() {
    if (!cacheConfig.USE_REDIS || !keyvRedisClient) {
      return;
    }

    try {
      this.clearRefreshTimer();
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          redis.call("del", KEYS[1])
        end
      `;
      await keyvRedisClient.eval(script, {
        keys: [LEADER_KEY],
        arguments: [this.UUID],
      });
    } catch (error) {
      logger.error('[ScheduledTasksLeader] Failed to release leadership lock:', error);
    }
  }

  clearRefreshTimer() {
    clearInterval(this.refreshTimer);
    this.refreshTimer = undefined;
  }

  async electSelf() {
    try {
      const result = await keyvRedisClient.set(LEADER_KEY, this.UUID, {
        NX: true,
        EX: LEADER_LEASE_DURATION,
      });

      if (result !== 'OK') {
        return false;
      }

      this.clearRefreshTimer();
      this.refreshTimer = setInterval(async () => {
        await this.renewLeadership();
      }, LEADER_RENEW_INTERVAL * 1000);
      this.refreshTimer.unref();
      return true;
    } catch (error) {
      logger.error('[ScheduledTasksLeader] Leader election failed:', error);
      return false;
    }
  }

  async renewLeadership(attempts = 1) {
    try {
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("expire", KEYS[1], ARGV[2])
        else
          return 0
        end
      `;

      const result = await keyvRedisClient.eval(script, {
        keys: [LEADER_KEY],
        arguments: [this.UUID, LEADER_LEASE_DURATION.toString()],
      });

      if (result === 0) {
        logger.warn('[ScheduledTasksLeader] Lost leadership, clearing refresh timer');
        this.clearRefreshTimer();
      }
    } catch (error) {
      logger.error(
        `[ScheduledTasksLeader] Failed to renew leadership (attempt ${attempts})`,
        error,
      );
      if (attempts <= LEADER_RENEW_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, LEADER_RENEW_RETRY_DELAY * 1000));
        await this.renewLeadership(attempts + 1);
      } else {
        logger.error('[ScheduledTasksLeader] Exceeded maximum attempts to renew leadership');
        this.clearRefreshTimer();
      }
    }
  }
}

const defaultLeader = new ScheduledTasksLeader();

module.exports = {
  isScheduledTasksLeader: () => defaultLeader.isLeader(),
};
