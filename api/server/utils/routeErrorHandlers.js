const { ErrorClassifier } = require('./errorClassifier');
const { logger } = require('@librechat/data-schemas');

/**
 * Handle errors for messages routes
 */
const handleMessagesError = (error, req, res, operation) => {
  const userFriendlyError = ErrorClassifier.getUserFriendlyError(error, {
    endpoint: 'messages',
    operation,
    userId: req.user?.id,
    conversationId: req.params?.conversationId,
    messageId: req.params?.messageId,
    path: req.path,
    method: req.method
  });

  logger.error(`[Messages ${operation}] Error:`, {
    ...userFriendlyError,
    stack: error.stack
  });

  // Determine status code based on error type
  let statusCode = 500;
  if (userFriendlyError.type === 'PERMISSION_ERROR') statusCode = 403;
  if (userFriendlyError.type === 'AUTHENTICATION_ERROR') statusCode = 401;
  if (userFriendlyError.type === 'VALIDATION_ERROR') statusCode = 400;
  if (userFriendlyError.type === 'DATABASE_ERROR' && error.message?.includes('not found')) statusCode = 404;

  res.status(statusCode).json({
    error: userFriendlyError.message,
    errorType: userFriendlyError.type,
    suggestion: userFriendlyError.suggestion,
    requestId: userFriendlyError.timestamp
  });
};

/**
 * Handle errors for MCP routes
 */
const handleMCPError = (error, req, res, operation) => {
  const userFriendlyError = ErrorClassifier.getUserFriendlyError(error, {
    endpoint: 'mcp',
    operation,
    userId: req.user?.id,
    serverName: req.params?.serverName,
    flowId: req.params?.flowId || req.query?.flowId,
    path: req.path,
    method: req.method
  });

  // Special handling for OAuth errors
  if (error.message?.includes('OAuth') || error.message?.includes('authentication')) {
    userFriendlyError.type = 'AUTHENTICATION_ERROR';
    userFriendlyError.message = 'Authentication required for this MCP server';
    userFriendlyError.suggestion = 'Please complete the OAuth flow to continue';
  }

  logger.error(`[MCP ${operation}] Error:`, {
    ...userFriendlyError,
    stack: error.stack
  });

  // Determine status code
  let statusCode = 500;
  if (userFriendlyError.type === 'AUTHENTICATION_ERROR') statusCode = 401;
  if (userFriendlyError.type === 'PERMISSION_ERROR') statusCode = 403;
  if (userFriendlyError.type === 'CONFIGURATION_ERROR') statusCode = 404;

  res.status(statusCode).json({
    error: userFriendlyError.message,
    errorType: userFriendlyError.type,
    suggestion: userFriendlyError.suggestion,
    context: {
      serverName: req.params?.serverName,
      operation
    }
  });
};

/**
 * Format error for abort middleware
 * This returns the formatted error object without sending a response
 */
const formatAbortError = (error, req, data = {}) => {
  const userFriendlyError = ErrorClassifier.getUserFriendlyError(error, {
    operation: 'abort_error',
    conversationId: data.conversationId,
    endpoint: req.body?.endpointOption?.endpoint,
    userId: req.user?.id,
    messageId: data.messageId,
    parentMessageId: data.parentMessageId
  });

  logger.error('[Abort Middleware] Error classified:', {
    type: userFriendlyError.type,
    originalError: error?.message || error,
    ...userFriendlyError
  });

  // Return structured error data that can be stringified in handleAbortError
  return {
    type: 'classified_error',
    errorType: userFriendlyError.type,
    title: userFriendlyError.title,
    message: userFriendlyError.message,
    suggestion: userFriendlyError.suggestion,
    originalError: userFriendlyError.originalError,
    timestamp: userFriendlyError.timestamp
  };
};

/**
 * Generic error handler for any route
 * Can be used as a fallback for routes that don't fit the above patterns
 */
const handleGenericError = (error, req, res, endpoint, operation) => {
  const userFriendlyError = ErrorClassifier.getUserFriendlyError(error, {
    endpoint,
    operation,
    userId: req.user?.id,
    path: req.path,
    method: req.method
  });

  logger.error(`[${endpoint} ${operation}] Error:`, {
    ...userFriendlyError,
    stack: error.stack
  });

  res.status(500).json({
    error: userFriendlyError.message,
    errorType: userFriendlyError.type,
    suggestion: userFriendlyError.suggestion,
    requestId: userFriendlyError.timestamp
  });
};

module.exports = {
  handleMessagesError,
  handleMCPError,
  formatAbortError,
  handleGenericError
};