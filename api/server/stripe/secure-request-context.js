const { logger } = require('@librechat/data-schemas');
const { AsyncLocalStorage } = require('async_hooks');
const asyncLocalStorage = new AsyncLocalStorage();

const SECURE_REQUEST_CONTEXT_HEADER = process.env.SECURE_REQUEST_CONTEXT_HEADER;

/**
 * Middleware to attach a secure request context to the request.
 * @param {import('express').Request} req - The request object.
 * @param {import('express').Response} _ - The response object (not used).
 * @param {function} next - The next middleware function.
 * @returns {void}
 */
function middleware(req, _, next) {
  // Skip middleware if SECURE_REQUEST_CONTEXT_HEADER is not set
  if (!SECURE_REQUEST_CONTEXT_HEADER) {
    logger.warn(
      '[Stripe] SECURE_REQUEST_CONTEXT_HEADER environment variable is not set. Skipping secure request context middleware.',
    );
    return next();
  }

  // Get the header by name
  const srcHeader = req.header(SECURE_REQUEST_CONTEXT_HEADER);
  if (srcHeader) {
    logger.info(
      `[Stripe] Added '${SECURE_REQUEST_CONTEXT_HEADER}: ${maskHeader(srcHeader)}' to the request context`,
    );
  } else {
    logger.warn(`[Stripe] No '${SECURE_REQUEST_CONTEXT_HEADER}' found in the request headers`);
  }
  asyncLocalStorage.run(srcHeader, () => {
    next();
  });
}

/**
 * Attaches the secure request context to the request options.
 * @param {import("node-fetch").RequestInit} [options]
 */
function attach(options = {}) {
  // If we don't have the header name, just return the options unmodified
  if (!SECURE_REQUEST_CONTEXT_HEADER) {
    logger.warn(
      '[Stripe] SECURE_REQUEST_CONTEXT_HEADER environment variable is not set. Nothing to attach.',
    );
    return options;
  }

  // Retrieve the secure request context from request context
  const src = asyncLocalStorage.getStore();
  if (!src) {
    logger.warn(`[Stripe] No '${SECURE_REQUEST_CONTEXT_HEADER}' found in the request context`);
    return options;
  }

  // Set the header in the options
  const headers = options.headers || new Headers();
  headers.set(SECURE_REQUEST_CONTEXT_HEADER, src);
  logger.info(`[Stripe] Attached '${SECURE_REQUEST_CONTEXT_HEADER}' to fetch headers`);

  // Return a modified options object with the src header
  return {
    ...options,
    headers,
  };
}

function maskHeader(header) {
  if (!header) return '';
  return '*'.repeat(header.length);
}

module.exports = {
  middleware,
  attach,
};
