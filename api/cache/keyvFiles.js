const { KeyvFile } = require('keyv-file');

const logFile = new KeyvFile({ filename: './data/logs.json' });
const violationFile = new KeyvFile({ filename: './data/violations.json' });

module.exports = {
  logFile,
  violationFile,
};
