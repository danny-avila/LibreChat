import IoRedis from 'ioredis';
import { Queue, Worker } from 'bullmq';
import { logger } from '@librechat/data-schemas';
import { cacheConfig } from '../cache/cacheConfig';
import { isValidTimezone, resolveDateTriggerMillis } from './timezone';
import type { Job, RepeatOptions } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Types } from 'mongoose';

const QUEUE_NAME = 'scheduled-tasks';
const QUEUE_PREFIX = `${cacheConfig.REDIS_KEY_PREFIX || 'librechat'}:bull`;

export type JobProcessor = (job: Job) => Promise<void>;

interface ScheduledTaskJobInput {
  _id: Types.ObjectId | string;
  status: 'active' | 'paused' | 'completed' | 'failed';
  triggerType: 'cron' | 'interval' | 'date';
  expression: string;
  timezone?: string;
}

export class TaskQueueService {
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private queueConnection: Redis | null = null;
  private workerConnection: Redis | null = null;
  private jobProcessor: JobProcessor | null = null;
  private initialized = false;

  /**
   * BullMQ refuses any ioredis client that has `keyPrefix` set (it uses raw
   * Lua scripts that don't honor client-side prefixing), and a Worker's
   * blocking connection must have `maxRetriesPerRequest: null`. The shared
   * `ioredisClient` violates both, so we create dedicated connections here
   * and namespace queue keys via BullMQ's own `prefix` option.
   */
  private buildConnection(forWorker: boolean): Redis | null {
    if (!cacheConfig.USE_REDIS || !cacheConfig.REDIS_URI) {
      return null;
    }
    return new IoRedis(cacheConfig.REDIS_URI, {
      maxRetriesPerRequest: forWorker ? null : 3,
    });
  }

  /**
   * Lazy-initialize the Queue/Worker so simply importing this module does not
   * spin up BullMQ workers (which would happen in builds, tests, scripts).
   */
  private ensureInitialized(): void {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    this.queueConnection = this.buildConnection(false);
    this.workerConnection = this.buildConnection(true);
    if (!this.queueConnection || !this.workerConnection) {
      logger.warn('Redis is not configured. Scheduled tasks will not be processed.');
      return;
    }

    this.queue = new Queue(QUEUE_NAME, {
      connection: this.queueConnection,
      prefix: QUEUE_PREFIX,
    });

    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        await this.processJob(job);
      },
      {
        connection: this.workerConnection,
        prefix: QUEUE_PREFIX,
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

  /**
   * Create or replace the schedule for a task.
   *
   * Recurring triggers (`cron`, `interval`) use BullMQ's JobScheduler API —
   * the schedulerId equals the task's Mongo `_id`, so upserts replace any
   * prior schedule for that task atomically and removals are a single
   * `removeJobScheduler(taskId)` call with no fuzzy key matching.
   *
   * `date` triggers are one-off and get enqueued as a delayed job keyed by
   * the same id so `removeTask` can clean them up uniformly.
   */
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

    if (task.timezone && !isValidTimezone(task.timezone)) {
      throw new Error(`Invalid IANA timezone for task ${jobId}: ${task.timezone}`);
    }

    if (task.triggerType === 'date') {
      const targetMs = resolveDateTriggerMillis(task.expression, task.timezone);
      const delay = targetMs - Date.now();
      if (delay > 0) {
        await this.queue.add(QUEUE_NAME, { taskId: jobId }, { jobId, delay });
      }
      return;
    }

    let repeatOptions: Omit<RepeatOptions, 'key'>;
    if (task.triggerType === 'cron') {
      repeatOptions = { pattern: task.expression };
      if (task.timezone) {
        repeatOptions.tz = task.timezone;
      }
    } else {
      const every = parseInt(task.expression, 10);
      if (Number.isNaN(every) || every <= 0) {
        throw new Error(`Invalid interval expression for task ${jobId}: ${task.expression}`);
      }
      repeatOptions = { every };
    }

    await this.queue.upsertJobScheduler(jobId, repeatOptions, {
      name: QUEUE_NAME,
      data: { taskId: jobId },
    });
  }

  /**
   * Cancel every BullMQ artefact tied to a task. Idempotent — safe to call
   * for unknown ids. JobScheduler removal handles recurring (cron/interval)
   * schedules; `queue.getJob(taskId)` covers any one-off delayed jobs that
   * were enqueued for a `date` trigger.
   */
  public async removeTask(taskId: string): Promise<void> {
    this.ensureInitialized();
    if (!this.queue) {
      return;
    }

    try {
      await this.queue.removeJobScheduler(taskId);
    } catch (err) {
      logger.error(`[TaskQueueService] removeJobScheduler failed for ${taskId}:`, err);
    }

    try {
      const job = await this.queue.getJob(taskId);
      if (job) {
        await job.remove();
      }
    } catch (err) {
      logger.error(`[TaskQueueService] Failed to remove pending job ${taskId}:`, err);
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
