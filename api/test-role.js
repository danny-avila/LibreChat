require('dotenv').config({ path: '../.env' });
const connect = require('../config/connect');
const { Role } = require('@librechat/data-schemas');

(async () => {
  await connect();
  console.log('Connected to database');
  const role = await Role.findOne({ name: 'ADMIN' });
  console.log(role);
})();