const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');
const models = createModels(mongoose);

module.exports = { ...models };
