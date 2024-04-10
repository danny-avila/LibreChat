const Agenda = require('agenda');
const { logger } = require('~/config');
const mongodb = require('mongodb');

class JobScheduler {
  constructor() {
    this.agenda = new Agenda({ db: { address: process.env.MONGO_URI } });
  }

  async start() {
    try {
      logger.info('Starting Agenda...');
      await this.agenda.start();
      logger.info('Agenda successfully started and connected to MongoDB.');
    } catch (error) {
      logger.error('Failed to start Agenda:', error);
    }
  }

  async now(jobName, data, userId) {
    try {
      const job = await this.agenda.now(jobName, { data: data, requestUserId: userId });
      logger.debug(`Job '${job.attrs.name}' scheduled successfully.`);
      return { id: job.attrs._id.toString() };
    } catch (error) {
      throw new Error(`Failed to schedule job '${jobName}': ${error}`);
    }
  }

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
