const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');
const { connectDb } = require('./connect');
const indexSync = require('./indexSync');

const models = createModels(mongoose);

module.exports = { connectDb, indexSync, ...models };
