const Agenda = require('agenda');
const { getImporter } = require('~/server/utils/import');
const logger = require('~/config/winston');

const agenda = new Agenda({ db: { address: process.env.MONGO_URI } });

async function startAgenda() {
  try {
    logger.info('Starting Agenda...');
    await agenda.start();
    logger.info('Agenda successfully started and connected to MongoDB.');
  } catch (error) {
    logger.error('Failed to start Agenda:', error);
  }
}

startAgenda();

agenda.define('import conversation', async (job, done) => {
  const { data, requestUserId } = job.attrs.data;
  try {
    logger.info('Importing conversation...');
    const jsonData = JSON.parse(data);
    const importer = getImporter(jsonData);
    await importer(jsonData, requestUserId);
    logger.info('Finished importing conversations');
    done();
  } catch (error) {
    logger.error('Failed to import conversation: ', error);
    done(error);
  }
});

module.exports = agenda;
