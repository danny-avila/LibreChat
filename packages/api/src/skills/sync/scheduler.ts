import type { SkillSyncConfig } from 'librechat-data-provider';
import { logger } from '@librechat/data-schemas';
import { registerShutdownTask } from '~/app/shutdown';
import type { GitHubSkillSyncRunner } from './github';

export type GitHubSkillSyncScheduler = {
  stop: () => void;
};

export function startGitHubSkillSyncScheduler(params: {
  getConfig: () => SkillSyncConfig | undefined;
  runner: GitHubSkillSyncRunner;
}): GitHubSkillSyncScheduler | null {
  const github = params.getConfig()?.github;
  const sources = Array.isArray(github?.sources) ? github.sources : [];
  const intervalMinutes =
    typeof github?.intervalMinutes === 'number' &&
    Number.isFinite(github.intervalMinutes) &&
    github.intervalMinutes >= 5
      ? github.intervalMinutes
      : 60;
  if (!github?.enabled || sources.length === 0) {
    return null;
  }
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  const run = () => {
    if (stopped) {
      return;
    }
    params.runner.runOnce().catch((error) => {
      logger.error('[GitHubSkillSync] Scheduled run failed:', error);
    });
  };

  if (github.runOnStartup) {
    run();
  }

  timer = setInterval(run, intervalMinutes * 60 * 1000);

  const scheduler = {
    stop: () => {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
    },
  };

  registerShutdownTask('github skill sync scheduler', () => {
    scheduler.stop();
  });

  return scheduler;
}
