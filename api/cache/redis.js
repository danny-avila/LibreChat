const Redis = require('ioredis');
const { REDIS_URI } = process.env ?? {};
const redis = new Redis.Cluster(REDIS_URI);
module.exports = redis;
