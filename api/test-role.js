require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const connect = require('../config/connect');
const { createRoleMethods, createRoleModel } = require('@librechat/data-schemas');
createRoleModel(mongoose);
const { listRoles } = createRoleMethods(mongoose);

(async () => {
  await connect();
  console.log('Connected to database');
  const roles = await listRoles();
  console.dir(roles, { depth: null });
})();
