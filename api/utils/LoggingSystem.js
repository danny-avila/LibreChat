const pino = require('pino');

const logger = pino({
  level: 'info'
});

const levels = {
  TRACE: 10,
  DEBUG: 20,
  INFO: 30,
  WARN: 40,
  ERROR: 50,
  FATAL: 60
};

const apiKeyPattern = /api[-_]?key/i;

let level = levels.INFO;

module.exports = {
  levels,
  setLevel: (l) => (level = l),
  log: {
    trace: (msg) => {
      if (level > levels.TRACE) return;
      logger.trace(msg);
    },
    debug: (msg) => {
      if (level > levels.DEBUG) return;
      logger.debug(msg);
    },
    info: (msg) => {
      if (level > levels.INFO) return;
      logger.info(msg);
    },
    warn: (msg) => {
      if (level > levels.WARN) return;
      logger.warn(msg);
    },
    error: (msg) => {
      if (level > levels.ERROR) return;
      logger.error(msg);
    },
    fatal: (msg) => {
      if (level > levels.FATAL) return;
      logger.fatal(msg);
    },
    parameters: (parameters) => {
      if (level > levels.DEBUG) return;
      logger.debug({ parameters }, 'Function Parameters');
    },
    functionName: (name) => {
      if (level > levels.INFO) return;
      logger.debug(`EXECUTING: ${name}`);
    },
    flow: (flow) => {
      if (level > levels.DEBUG) return;
      logger.debug(`BEGIN FLOW: ${flow}`);
    },
    variable: ({ name, value }) => {
      if (level > levels.DEBUG) return;
      const sanitizedValue = apiKeyPattern.test(name) ? pino.redact(value) : value;
      logger.debug({ variable: { name, value: sanitizedValue } }, `VARIABLE ${name}`);
    },
    request: () => (req, res, next) => {
      if (level > levels.DEBUG) return next();
      logger.debug({ query: req.query, body: req.body }, `Hit URL ${req.url} with following`);
      return next();
    }
  }
};

