const { randomUUID } = require('crypto');
const { logger } = require('@librechat/data-schemas');

const toMs = (start) => Number((process.hrtime.bigint() - start) / 1000000n);

module.exports = function trace(req, res, next) {
  const headerTraceId = req.headers['x-trace-id'];
  const traceId =
    (Array.isArray(headerTraceId) ? headerTraceId[0] : headerTraceId) ||
    req.body?.traceId ||
    randomUUID();
  const start = process.hrtime.bigint();

  req.trace = { id: traceId, start, steps: [] };
  req.traceStep = (label, meta = {}) => {
    const durationMs = toMs(start);
    req.trace.steps.push({ label, durationMs });
    logger.info(
      {
        traceId,
        durationMs,
        label,
        ...meta,
      },
      '[trace]',
    );
  };

  res.setHeader('X-Trace-Id', traceId);
  logger.info(
    {
      traceId,
      method: req.method,
      path: req.originalUrl,
    },
    '[trace] request_start',
  );

  res.on('finish', () => {
    logger.info(
      {
        traceId,
        status: res.statusCode,
        durationMs: toMs(start),
      },
      '[trace] request_end',
    );
    if (req.trace?.steps?.length) {
      const firstTokenStep = req.trace.steps.find((step) =>
        step.label.endsWith('_first_token'),
      );
      const firstTokenMs = firstTokenStep?.durationMs ?? null;
      logger.info(
        {
          traceId,
          totalMs: toMs(start),
          firstTokenMs,
          steps: req.trace.steps,
        },
        '[trace] summary',
      );
    }
  });

  next();
};
