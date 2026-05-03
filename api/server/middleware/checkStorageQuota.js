const { createCheckStorageQuota } = require('@librechat/api');
const db = require('~/models');

module.exports = createCheckStorageQuota({ getStorageUsage: db.getStorageUsage });
