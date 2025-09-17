const { logger } = require('@librechat/data-schemas');
const { AsyncLocalStorage } = require('async_hooks');
const { redactValue } = require('./utils');

/**
 * AsyncLocalStorage is a new-ish Node feature (v13+) that allows you to attach
 * arbitrary data to a request. This is conceptually similar to Context in React.
 * This is an in-memory storage built-into node.js itself that's tied to the
 * lifecycle of the request. This allows us not to need to make much deeper code
 * modifications to LibreChat to pass request context through the layers.
 */
const asyncLocalStorage = new AsyncLocalStorage();

/**
 * Comma-separated list of headers to forward through the secure request context
 * Example: "x-stripe-account,x-user-id,authorization"
 */
const FORWARDED_STRIPE_HEADERS = process.env.FORWARDED_STRIPE_HEADERS;
/**
 * Middleware to attach a secure request context to the request.
 * @param {import('express').Request} req - The request object.
 * @param {import('express').Response} _ - The response object (not used).
 * @param {function} next - The next middleware function.
 * @returns {void}
 */
function middleware(req, _, next) {


  // Parse header names from comma-separated list
  let headerNames = [];
  if (FORWARDED_STRIPE_HEADERS) {
    headerNames = FORWARDED_STRIPE_HEADERS.split(',')
      .map(name => name.trim())
      .filter(name => name.length > 0);
  }
  
  // Skip middleware if FORWARDED_STRIPE_HEADERS is not set
  if (headerNames.length === 0) {
    logger.warn('[Stripe:forwardedHeaders] FORWARDED_STRIPE_HEADERS is empty. Skipping forwarded headers middleware.');
    return next();
  }

  // Extract headers from request
  const headers = {};
  
  for (const headerName of headerNames) {
    const headerValue = req.header(headerName);
    if (headerValue) {
      headers[headerName] = headerValue;
      logger.info(
        `[Stripe:forwardedHeaders] Added '${headerName}: ${redactValue(headerName, headerValue)}' to the request context`,
      );
    } else {
      logger.warn(`[Stripe:forwardedHeaders] No '${headerName}' found in the request headers`);
    }
  }

  // Defensively check if we already have data in the store
  const existingStore = asyncLocalStorage.getStore();
  if (existingStore) {
    logger.error(
      '[Stripe:forwardedHeaders] Unexpectedly found existing data in AsyncLocalStorage. This is a bug.',
    );
    return next(
      new Error(
        '[Stripe:forwardedHeaders] Unexpectedly found existing data in AsyncLocalStorage. This is a bug.',
      ),
    );
  } else {
    logger.debug(
      `[Stripe:forwardedHeaders] No existing data found in AsyncLocalStorage, proceeding to set headers.`,
    );
  }

  // Store headers object in AsyncLocalStorage (even if empty, for consistency)
  asyncLocalStorage.run(headers, () => {
    next();
  });
}

/**
 * Attaches the secure request context to the request options.
 * @param {import("node-fetch").RequestInit} [options]
 */
function attach(options = {}) {
  // If we don't have FORWARDED_STRIPE_HEADERS configured, just return the options unmodified
  if (!FORWARDED_STRIPE_HEADERS) {
    logger.warn(
      '[Stripe:forwardedHeaders] FORWARDED_STRIPE_HEADERS environment variable is not set. Nothing to attach.',
    );
    return options;
  }

  // Retrieve the stored headers from request context
  const storedHeaders = asyncLocalStorage.getStore();
  if (!storedHeaders || typeof storedHeaders !== 'object') {
    logger.warn('[Stripe:forwardedHeaders] No headers found in the request context');
    return options;
  }

  // Set the headers in the options
  const headers = options.headers || new Headers();
  let attachedCount = 0;
  
  for (const [headerName, headerValue] of Object.entries(storedHeaders)) {
    if (headerValue) {
      headers.set(headerName, headerValue);
      attachedCount++;
      logger.info(`[Stripe:forwardedHeaders] Attached '${headerName}' to fetch headers`);
    }
  }

  if (attachedCount === 0) {
    logger.warn('[Stripe:forwardedHeaders] No headers available to attach');
    return options;
  }

  // Return a modified options object with the headers
  return {
    ...options,
    headers,
  };
  
}



module.exports = {
  middleware,
  attach,
};
