const { KeyvFile } = require('keyv-file');

const logFile = new KeyvFile({ filename: './data/logs.json' }).setMaxListeners(20);
const violationFile = new KeyvFile({ filename: './data/violations.json' }).setMaxListeners(20);

module.exports = {
  logFile,
  violationFile,
};
