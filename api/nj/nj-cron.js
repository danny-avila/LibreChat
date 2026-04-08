const mongoose = require('mongoose');
const { CronJob } = require('cron');
const { logger, archiveOldConversations } = require('@librechat/data-schemas');

async function archiveOldConversationJob() {
  const count = await archiveOldConversations(mongoose);
  logger.info(`Archived ${count} old conversations`);
}

function njCronJobs() {
  // Automatically archive old conversations on a schedule
  CronJob.from({
    cronTime: '0 0 * * *', // Every day at midnight
    onTick: archiveOldConversationJob,
    start: true, // Starts the job automatically
    timeZone: 'America/New_York',
  });
}

module.exports = { njCronJobs };
