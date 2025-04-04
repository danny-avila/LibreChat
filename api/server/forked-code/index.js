const forkedRoutes = require('./routes');

/**
 * Initialize all forked code customizations
 *
 * @param {Express} app - Express application instance
 */
const initForkedCode = (app) => {
  // Register forked routes under the /api/forked path
  app.use('/api/forked', forkedRoutes);

  // Add any other forked code initializations here
};

module.exports = {
  initForkedCode,
};