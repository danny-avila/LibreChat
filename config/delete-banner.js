const path = require('path');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { askQuestion, silentExit } = require('./helpers');
const Banner = require('~/models/schema/banner');
const connect = require('./connect');

(async () => {
  await connect();

  console.purple('--------------------------');
  console.purple('Delete the banner!');
  console.purple('--------------------------');

  const now = new Date();

  try {
    const banner = await Banner.findOne({
      displayFrom: { $lte: now },
      $or: [{ displayTo: { $gte: now } }, { displayTo: null }],
    });

    if (!banner) {
      console.yellow('No banner found to delete.');
      silentExit(0);
    }

    console.purple('Current banner:');
    console.log(`Message: ${banner.message}`);
    console.log(`Display From: ${banner.displayFrom}`);
    console.log(`Display To: ${banner.displayTo || 'Not specified'}`);
    console.log(`Is Public: ${banner.isPublic}`);

    const confirmDelete = await askQuestion('Do you want to delete this banner? (y/N): ');

    if (confirmDelete.toLowerCase() === 'y') {
      await Banner.findByIdAndDelete(banner._id);
      console.green('Banner deleted successfully!');
    } else {
      console.yellow('Banner deletion cancelled.');
    }
  } catch (error) {
    console.red('Error: ' + error.message);
    console.error(error);
    silentExit(1);
  }

  silentExit(0);
})();

process.on('uncaughtException', (err) => {
  if (!err.message.includes('fetch failed')) {
    console.error('There was an uncaught error:');
    console.error(err);
  }

  if (err.message.includes('fetch failed')) {
    return;
  } else {
    process.exit(1);
  }
});
