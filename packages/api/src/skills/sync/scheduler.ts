import { logger } from '@librechat/data-schemas';
import type { SkillSyncConfig } from 'librechat-data-provider';
import type { GitHubSkillSyncRunner } from './github';
import { registerShutdownTask } from '~/app/shutdown';

const NODE_TIMER_MAX_MS = 2147483647;
const SKILL_SYNC_MIN_INTERVAL_MINUTES = 5;
export const SKILL_SYNC_MAX_TIMER_INTERVAL_MINUTES: number = Math.floor(NODE_TIMER_MAX_MS / 60_000);

type MaybePromise<T> = T | Promise<T>;

export type GitHubSkillSyncScheduler = {
  stop: () => void;
};

function normalizeIntervalMinutes(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 60;
  }
  return Math.min(
    SKILL_SYNC_MAX_TIMER_INTERVAL_MINUTES,
    Math.max(SKILL_SYNC_MIN_INTERVAL_MINUTES, Math.floor(value)),
  );
}

function getSources(config: SkillSyncConfig | undefined) {
  const sources = config?.github?.sources;
  return Array.isArray(sources) ? sources : [];
}

function hasAnySources(config: SkillSyncConfig | undefined): boolean {
  if (getSources(config).length > 0) {
    return true;
  }
  if (config?.gitlab?.enabled && config.gitlab.sources.length > 0) {
    return true;
  }
  if (config?.bitbucket?.enabled && config.bitbucket.sources.length > 0) {
    return true;
  }
  if (config?.azuredevops?.enabled && config.azuredevops.sources.length > 0) {
    return true;
  }
  return false;
}

function hasAnyEnabled(config: SkillSyncConfig | undefined): boolean {
  if (config?.github?.enabled && getSources(config).length > 0) {
    return true;
  }
  if (config?.gitlab?.enabled && config.gitlab.sources.length > 0) {
    return true;
  }
  if (config?.bitbucket?.enabled && config.bitbucket.sources.length > 0) {
    return true;
  }
  if (config?.azuredevops?.enabled && config.azuredevops.sources.length > 0) {
    return true;
  }
  return false;
}

function getMinIntervalMinutes(config: SkillSyncConfig | undefined): number {
  const intervals: number[] = [];
  if (config?.github?.enabled) {
    intervals.push(config.github.intervalMinutes ?? 60);
  }
  if (config?.gitlab?.enabled) {
    intervals.push(config.gitlab.intervalMinutes ?? 60);
  }
  if (config?.bitbucket?.enabled) {
    intervals.push(config.bitbucket.intervalMinutes ?? 60);
  }
  if (config?.azuredevops?.enabled) {
    intervals.push(config.azuredevops.intervalMinutes ?? 60);
  }
  return intervals.length > 0 ? Math.min(...intervals) : 60;
}

function shouldRunOnStartup(config: SkillSyncConfig | undefined): boolean {
  if (config?.github?.enabled && config.github.runOnStartup && getSources(config).length > 0) {
    return true;
  }
  if (config?.gitlab?.enabled && config.gitlab.runOnStartup && config.gitlab.sources.length > 0) {
    return true;
  }
  if (
    config?.bitbucket?.enabled &&
    config.bitbucket.runOnStartup &&
    config.bitbucket.sources.length > 0
  ) {
    return true;
  }
  if (
    config?.azuredevops?.enabled &&
    config.azuredevops.runOnStartup &&
    config.azuredevops.sources.length > 0
  ) {
    return true;
  }
  return false;
}

export function startGitHubSkillSyncScheduler(params: {
  getConfig: () => MaybePromise<SkillSyncConfig | undefined>;
  runner: GitHubSkillSyncRunner;
}): GitHubSkillSyncScheduler {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  const getConfig = async (): Promise<SkillSyncConfig | undefined> => {
    try {
      return await params.getConfig();
    } catch (error) {
      logger.error('[GitHubSkillSync] Failed to load scheduler config:', error);
      return undefined;
    }
  };

  const scheduleNext = (config: SkillSyncConfig | undefined) => {
    if (stopped) {
      return;
    }
    const delayMs = normalizeIntervalMinutes(getMinIntervalMinutes(config)) * 60 * 1000;
    timer = setTimeout(tick, delayMs);
    timer.unref?.();
  };

  const runIfEnabled = async () => {
    const config = await getConfig();
    if (!hasAnyEnabled(config)) {
      return config;
    }
    try {
      await params.runner.runOnce();
    } catch (error) {
      logger.error('[SkillSync] Scheduled run failed:', error);
    }
    return getConfig();
  };

  async function tick() {
    if (stopped) {
      return;
    }
    const config = await runIfEnabled();
    scheduleNext(config);
  }

  const scheduler = {
    stop: () => {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };

  void (async () => {
    const config = await getConfig();
    if (shouldRunOnStartup(config)) {
      void params.runner.runOnce().catch((error) => {
        logger.error('[SkillSync] Scheduled startup run failed:', error);
      });
    }
    scheduleNext(config);
  })();

  registerShutdownTask('github skill sync scheduler', () => {
    scheduler.stop();
  });

  return scheduler;
}
