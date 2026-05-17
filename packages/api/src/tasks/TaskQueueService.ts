import { Queue, Worker } from 'bullmq';
import { logger } from '@librechat/data-schemas';
import { ioredisClient } from '../cache/redisClients';
import type { Job, RepeatOptions } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Types } from 'mongoose';

const QUEUE_NAME = 'scheduled-tasks';

export type JobProcessor = (job: Job) => Promise<void>;

interface ScheduledTaskJobInput {
  _id: Types.ObjectId | string;
  status: 'active' | 'paused' | 'completed' | 'failed';
  triggerType: 'cron' | 'interval' | 'date';
  expression: string;
}

export class TaskQueueService {
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private jobProcessor: JobProcessor | null = null;
  private initialized = false;

  /**
   * Lazy-initialize the Queue/Worker so simply importing this module does not
   * spin up BullMQ workers (which would happen in builds, tests, scripts).
   */
  private ensureInitialized(): void {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    if (!ioredisClient) {
      logger.warn('Redis is not configured. Scheduled tasks will not be processed.');
      return;
    }

    this.queue = new Queue(QUEUE_NAME, {
      connection: ioredisClient as Redis,
    });

    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        await this.processJob(job);
      },
      {
        connection: ioredisClient as Redis,
      },
    );

    this.worker.on('completed', (job) => {
      logger.info(`Job ${job.id} completed successfully`);
    });

    this.worker.on('failed', (job, err) => {
      logger.error(`Job ${job?.id} failed with error: ${err.message}`);
    });
  }

  public setJobProcessor(processor: JobProcessor): void {
    this.jobProcessor = processor;
    this.ensureInitialized();
  }

  private async processJob(job: Job): Promise<void> {
    const { taskId } = job.data as { taskId: string };
    logger.info(`Processing scheduled task ${taskId}`);

    if (this.jobProcessor) {
      await this.jobProcessor(job);
      return;
    }
    logger.warn('No job processor configured for scheduled tasks');
  }

  public async addOrUpdateTask(task: ScheduledTaskJobInput): Promise<void> {
    this.ensureInitialized();
    if (!this.queue) {
      throw new Error('Task queue is not initialized (Redis is required).');
    }

    const jobId = task._id.toString();
    await this.removeTask(jobId);

    if (task.status !== 'active') {
      return;
    }

    if (task.triggerType === 'date') {
      const delay = new Date(task.expression).getTime() - Date.now();
      if (delay > 0) {
        await this.queue.add(QUEUE_NAME, { taskId: jobId }, { jobId, delay });
      }
      return;
    }

    let repeatOptions: RepeatOptions;
    if (task.triggerType === 'cron') {
      repeatOptions = { pattern: task.expression };
    } else {
      const every = parseInt(task.expression, 10);
      if (Number.isNaN(every) || every <= 0) {
        throw new Error(`Invalid interval expression for task ${jobId}: ${task.expression}`);
      }
      repeatOptions = { every };
    }

    await this.queue.add(
      QUEUE_NAME,
      { taskId: jobId },
      { jobId, repeat: repeatOptions },
    );
  }

  public async removeTask(taskId: string): Promise<void> {
    this.ensureInitialized();
    if (!this.queue) {
      return;
    }

    const repeatableJobs = await this.queue.getRepeatableJobs();
    const jobToRemove = repeatableJobs.find((job) => job.id === taskId);
    if (jobToRemove) {
      await this.queue.removeRepeatableByKey(jobToRemove.key);
    }

    const job = await this.queue.getJob(taskId);
    if (job) {
      await job.remove();
    }
  }
}

let _instance: TaskQueueService | null = null;

export function getTaskQueueService(): TaskQueueService {
  if (!_instance) {
    _instance = new TaskQueueService();
  }
  return _instance;
}

/** @deprecated use getTaskQueueService() instead. Kept for backwards compatibility. */
export const taskQueueService = new Proxy({} as TaskQueueService, {
  get(_target, prop, receiver) {
    return Reflect.get(getTaskQueueService(), prop, receiver);
  },
});
