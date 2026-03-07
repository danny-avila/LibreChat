const mongoose = require('mongoose');
const { createModels } = require('@bizu/data-schemas');
const models = createModels(mongoose);

module.exports = { ...models };
