const Agenda = require('agenda');
const { logger } = require('~/config');
const mongodb = require('mongodb');

/**
 * Class for scheduling and running jobs.
 * The workflow is as follows: start the job scheduler, define a job, and then schedule the job using defined job name.
 */
class JobScheduler {
  constructor() {
    this.agenda = new Agenda({ db: { address: process.env.MONGO_URI } });
  }

  /**
   * Starts the job scheduler.
   */
  async start() {
    try {
      logger.info('Starting Agenda...');
      await this.agenda.start();
      logger.info('Agenda successfully started and connected to MongoDB.');
    } catch (error) {
      logger.error('Failed to start Agenda:', error);
    }
  }

  /**
   * Schedules a job to start immediately.
   * @param {string} jobName - The name of the job to schedule.
   * @param {string} filepath - The filepath to pass to the job.
   * @param {string} userId - The ID of the user requesting the job.
   * @returns {Promise<{ id: string }>} - A promise that resolves with the ID of the scheduled job.
   * @throws {Error} - If the job fails to schedule.
   */
  async now(jobName, filepath, userId) {
    try {
      const job = await this.agenda.now(jobName, { filepath, requestUserId: userId });
      logger.debug(`Job '${job.attrs.name}' scheduled successfully.`);
      return { id: job.attrs._id.toString() };
    } catch (error) {
      throw new Error(`Failed to schedule job '${jobName}': ${error}`);
    }
  }

  /**
   * Gets the status of a job.
   * @param {string} jobId - The ID of the job to get the status of.
   * @returns {Promise<{ id: string, userId: string, name: string, failReason: string, status: string } | null>} - A promise that resolves with the job status or null if the job is not found.
   * @throws {Error} - If multiple jobs are found.
   */
  async getJobStatus(jobId) {
    const job = await this.agenda.jobs({ _id: new mongodb.ObjectId(jobId) });
    if (!job || job.length === 0) {
      return null;
    }

    if (job.length > 1) {
      // This should never happen
      throw new Error('Multiple jobs found.');
    }

    const jobDetails = {
      id: job[0]._id,
      userId: job[0].attrs.data.requestUserId,
      name: job[0].attrs.name,
      failReason: job[0].attrs.failReason,
      status: !job[0].attrs.lastRunAt
        ? 'scheduled'
        : job[0].attrs.failedAt
          ? 'failed'
          : job[0].attrs.lastFinishedAt
            ? 'completed'
            : 'running',
    };

    return jobDetails;
  }

  /**
   * Defines a new job.
   * @param {string} name - The name of the job.
   * @param {Function} jobFunction - The function to run when the job is executed.
   */
  define(name, jobFunction) {
    this.agenda.define(name, async (job, done) => {
      try {
        await jobFunction(job, done);
      } catch (error) {
        logger.error(`Failed to run job '${name}': ${error}`);
        done(error);
      }
    });
  }
}

const jobScheduler = new JobScheduler();
jobScheduler.start();

module.exports = jobScheduler;
