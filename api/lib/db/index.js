const { connectDb, getModels} = require('./connectDb');
const indexSync = require('./indexSync');

module.exports = { connectDb, getModels, indexSync };
