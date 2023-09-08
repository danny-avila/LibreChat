const { KeyvFile } = require('keyv-file');

const keyvFile = new KeyvFile({ filename: './data/logs.json' });

module.exports = keyvFile;
