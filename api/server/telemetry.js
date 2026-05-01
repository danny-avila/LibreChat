require('dotenv').config();

const { initializeTelemetry } = require('@librechat/api/telemetry');

module.exports = initializeTelemetry();
