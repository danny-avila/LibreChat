import cron from 'node-cron';
import mongoose from 'mongoose';
import type { ScheduledTask } from 'node-cron';
import { logger } from '@librechat/data-schemas';
import { runSynthesisForUser } from './synthesize';

let scheduledTask: ScheduledTask | null = null;

interface SynthesisSchedulerConfig {
  cronExpression?: string;
  summaryModel: string;
  summaryApiKey: string;
  summaryBaseUrl?: string;
  synthesisModel: string;
  synthesisApiKey: string;
  synthesisBaseUrl?: string;
}

async function runScheduledSynthesis(config: SynthesisSchedulerConfig): Promise<void> {
  const MemoryDocument = mongoose.models.MemoryDocument;
  const Conversation = mongoose.models.Conversation;

  const usersWithMemories: mongoose.Types.ObjectId[] = await MemoryDocument.distinct('userId');
  const usersWithConversations: string[] = await Conversation.distinct('user');

  const allUserIds = new Set<string>([
    ...usersWithMemories.map((id) => id.toString()),
    ...usersWithConversations.map((id) => id.toString()),
  ]);

  logger.info(`[synthesis/scheduler] Processing ${allUserIds.size} users`);

  for (const userId of allUserIds) {
    try {
      await runSynthesisForUser(userId, {
        summaryModel: config.summaryModel,
        summaryApiKey: config.summaryApiKey,
        summaryBaseUrl: config.summaryBaseUrl,
        synthesisModel: config.synthesisModel,
        synthesisApiKey: config.synthesisApiKey,
        synthesisBaseUrl: config.synthesisBaseUrl,
      });
    } catch (error) {
      logger.error(`[synthesis/scheduler] Error processing user ${userId}:`, error);
    }
  }

  logger.info('[synthesis/scheduler] Scheduled synthesis complete');
}

export function startSynthesisScheduler(config: SynthesisSchedulerConfig): void {
  if (scheduledTask) {
    logger.warn('[synthesis/scheduler] Scheduler already running, skipping duplicate start');
    return;
  }

  const cronExpr = config.cronExpression ?? '0 3 * * *';

  scheduledTask = cron.schedule(cronExpr, async () => {
    logger.info('[synthesis/scheduler] Starting scheduled memory synthesis');
    try {
      await runScheduledSynthesis(config);
    } catch (error) {
      logger.error('[synthesis/scheduler] Scheduled synthesis failed:', error);
    }
  });

  logger.info(`[synthesis/scheduler] Memory synthesis scheduled with cron: ${cronExpr}`);
}

export function stopSynthesisScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    logger.info('[synthesis/scheduler] Scheduler stopped');
  }
}

export async function triggerManualSynthesis(
  userId: string,
  config: SynthesisSchedulerConfig,
): Promise<void> {
  logger.info(`[synthesis/scheduler] Manual synthesis triggered for user ${userId}`);
  await runSynthesisForUser(userId, {
    summaryModel: config.summaryModel,
    summaryApiKey: config.summaryApiKey,
    summaryBaseUrl: config.summaryBaseUrl,
    synthesisModel: config.synthesisModel,
    synthesisApiKey: config.synthesisApiKey,
    synthesisBaseUrl: config.synthesisBaseUrl,
  });
}
