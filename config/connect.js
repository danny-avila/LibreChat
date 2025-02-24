const path = require('path');
require('./helpers');
require('module-alias/register');
const moduleAlias = require('module-alias');

const basePath = path.resolve(__dirname, '..', 'api');
moduleAlias.addAlias('~', basePath);

const connectDb = require('~/lib/db/connectDb');

async function connect() {
  /**
   * Connect to the database
   * - If it takes a while, we'll warn the user
   */
  let timeout = setTimeout(() => {
    console.orange(
      'This is taking a while... You may need to check your connection if this fails.',
    );
    timeout = setTimeout(() => {
      console.orange('Still going... Might as well assume the connection failed...');
      timeout = setTimeout(() => {
        console.orange('Error incoming in 3... 2... 1...');
      }, 13000);
    }, 10000);
  }, 5000);
  // Attempt to connect to the database
  try {
    console.orange('Warming up the engines...');
    await connectDb();
    clearTimeout(timeout);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

module.exports = connect;
