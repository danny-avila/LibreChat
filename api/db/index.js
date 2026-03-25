const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');
const { connectDb } = require('./connect');

createModels(mongoose);

const indexSync = require('./indexSync');

module.exports = { connectDb, indexSync };
