const mongoose = require('mongoose');
const { createModels } = require('@vestai/data-schemas');
const models = createModels(mongoose);

module.exports = { ...models };
