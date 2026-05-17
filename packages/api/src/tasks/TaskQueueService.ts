import { Queue, Worker, Job } from 'bullmq';
import { logger } from '@librechat/data-schemas';
import { ioredisClient } from '../cache/redisClients';
import type { IScheduledTask } from '@librechat/data-schemas';
import type { Redis } from 'ioredis';

const QUEUE_NAME = 'scheduled-tasks';

export type JobProcessor = (job: Job) => Promise<void>;

export class TaskQueueService {
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private jobProcessor: JobProcessor | null = null;

  constructor() {
    if (ioredisClient) {
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
    } else {
      logger.warn('Redis is not configured. Scheduled tasks will not be processed.');
    }
  }

  public setJobProcessor(processor: JobProcessor) {
    this.jobProcessor = processor;
  }

  private async processJob(job: Job) {
    const { taskId } = job.data;
    logger.info(`Processing scheduled task ${taskId}`);
    
    if (this.jobProcessor) {
      await this.jobProcessor(job);
    } else {
      logger.warn('No job processor configured for scheduled tasks');
    }
  }

  public async addOrUpdateTask(task: IScheduledTask) {
    if (!this.queue) {
      throw new Error('Task queue is not initialized (Redis is required).');
    }

    const jobId = task._id.toString();

    // Remove existing repeatable job if any
    await this.removeTask(jobId);

    if (task.status === 'active') {
      let repeatOptions: any = {};
      
      if (task.triggerType === 'cron') {
        repeatOptions = { pattern: task.expression };
      } else if (task.triggerType === 'interval') {
        repeatOptions = { every: parseInt(task.expression, 10) };
      } else if (task.triggerType === 'date') {
        const delay = new Date(task.expression).getTime() - Date.now();
        if (delay > 0) {
          await this.queue.add(
            QUEUE_NAME,
            { taskId: jobId },
            { jobId, delay }
          );
          return;
        }
      }

      await this.queue.add(
        QUEUE_NAME,
        { taskId: jobId },
        {
          jobId,
          repeat: repeatOptions,
        }
      );
    }
  }

  public async removeTask(taskId: string) {
    if (!this.queue) return;

    // Remove repeatable jobs
    const repeatableJobs = await this.queue.getRepeatableJobs();
    const jobToRemove = repeatableJobs.find((job) => job.id === taskId);
    
    if (jobToRemove) {
      await this.queue.removeRepeatableByKey(jobToRemove.key);
    }

    // Remove delayed/waiting jobs
    const job = await this.queue.getJob(taskId);
    if (job) {
      await job.remove();
    }
  }
}

export const taskQueueService = new TaskQueueService();
