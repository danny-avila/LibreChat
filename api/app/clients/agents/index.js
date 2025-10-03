const initializeCustomAgent = require('./CustomAgent/initializeCustomAgent');
const initializeFunctionsAgent = require('./Functions/initializeFunctionsAgent');
const woodlandAgents = require('./Woodland');

module.exports = {
  initializeCustomAgent,
  initializeFunctionsAgent,
  ...woodlandAgents,
};
