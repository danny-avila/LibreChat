require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const connect = require('../config/connect');
const { createModels, createMethods } = require('@librechat/data-schemas');
createModels(mongoose);
const { listRoles } = createMethods(mongoose);

(async () => {
  await connect();
  console.log('Connected to database');
  const roles = await listRoles();
  console.dir(roles, { depth: null });
})();
