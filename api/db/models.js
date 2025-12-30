const mongoose = require('mongoose');
const { createModels } = require('@brainiac/data-schemas');
const models = createModels(mongoose);

module.exports = { ...models };
