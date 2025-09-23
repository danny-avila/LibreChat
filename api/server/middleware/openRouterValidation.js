const rateLimit = require('express-rate-limit');
const { logger } = require('~/config');

/**
 * Validates OpenRouter API key from request or environment
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const validateOpenRouterKey = (req, res, next) => {
  try {
    // Check for API key in user object (user-provided key)
    let hasKey = false;

    if (req.user && req.user.openRouterKey) {
      hasKey = true;
      logger.debug('[OpenRouter Validation] User-provided API key found');
    } else if (process.env.OPENROUTER_API_KEY) {
      hasKey = true;
      logger.debug('[OpenRouter Validation] Environment API key found');
    }

    if (!hasKey) {
      logger.warn('[OpenRouter Validation] No API key available');
      return res.status(401).json({
        error: {
          message: 'OpenRouter API key is required. Please configure your API key.',
          type: 'authentication_error',
          code: 'missing_api_key',
        },
      });
    }

    // Validate key format if it's user-provided
    if (req.user && req.user.openRouterKey) {
      const key = req.user.openRouterKey;
      if (!key.startsWith('sk-or-')) {
        logger.warn('[OpenRouter Validation] Invalid API key format');
        return res.status(401).json({
          error: {
            message: 'Invalid OpenRouter API key format. Key should start with "sk-or-"',
            type: 'authentication_error',
            code: 'invalid_api_key_format',
          },
        });
      }
    }

    next();
  } catch (error) {
    logger.error('[OpenRouter Validation] Error validating API key:', error);
    return res.status(500).json({
      error: {
        message: 'Error validating API key',
        type: 'internal_error',
      },
    });
  }
};

/**
 * Validates chat completion request body
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const validateChatCompletion = (req, res, next) => {
  try {
    const { messages, model, models } = req.body;

    // Validate messages
    if (!messages) {
      return res.status(400).json({
        error: {
          message: 'Messages field is required',
          type: 'invalid_request_error',
          param: 'messages',
        },
      });
    }

    if (!Array.isArray(messages)) {
      return res.status(400).json({
        error: {
          message: 'Messages must be an array',
          type: 'invalid_request_error',
          param: 'messages',
        },
      });
    }

    if (messages.length === 0) {
      return res.status(400).json({
        error: {
          message: 'Messages array cannot be empty',
          type: 'invalid_request_error',
          param: 'messages',
        },
      });
    }

    // Validate message structure
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];

      if (!message.role) {
        return res.status(400).json({
          error: {
            message: `Message at index ${i} is missing required field: role`,
            type: 'invalid_request_error',
            param: `messages[${i}].role`,
          },
        });
      }

      if (!['system', 'user', 'assistant', 'function', 'tool'].includes(message.role)) {
        return res.status(400).json({
          error: {
            message: `Message at index ${i} has invalid role: ${message.role}`,
            type: 'invalid_request_error',
            param: `messages[${i}].role`,
          },
        });
      }

      if (message.content === undefined && !message.function_call && !message.tool_calls) {
        return res.status(400).json({
          error: {
            message: `Message at index ${i} must have content, function_call, or tool_calls`,
            type: 'invalid_request_error',
            param: `messages[${i}]`,
          },
        });
      }
    }

    // Validate model (optional, will use default if not provided)
    if (model !== undefined && typeof model !== 'string') {
      return res.status(400).json({
        error: {
          message: 'Model must be a string',
          type: 'invalid_request_error',
          param: 'model',
        },
      });
    }

    // Validate fallback models array
    if (models !== undefined) {
      if (!Array.isArray(models)) {
        return res.status(400).json({
          error: {
            message: 'Models parameter must be an array',
            type: 'invalid_request_error',
            param: 'models',
          },
        });
      }

      if (models.length > 10) {
        return res.status(400).json({
          error: {
            message: 'Maximum 10 fallback models allowed',
            type: 'invalid_request_error',
            param: 'models',
          },
        });
      }

      // Check for Auto Router conflict
      const primaryModel = model || req.body.modelOptions?.model || 'openrouter/auto';
      if (models.length > 0 && primaryModel.includes('openrouter/auto')) {
        return res.status(400).json({
          error: {
            message: 'Fallback models cannot be used with Auto Router (openrouter/auto)',
            type: 'invalid_request_error',
            param: 'models',
          },
        });
      }

      // Validate each model in the array
      for (let i = 0; i < models.length; i++) {
        if (typeof models[i] !== 'string') {
          return res.status(400).json({
            error: {
              message: `Model at index ${i} must be a string`,
              type: 'invalid_request_error',
              param: `models[${i}]`,
            },
          });
        }
      }
    }

    // Validate optional parameters
    const { temperature, max_tokens, top_p, frequency_penalty, presence_penalty, n } = req.body;

    if (temperature !== undefined) {
      if (typeof temperature !== 'number' || temperature < 0 || temperature > 2) {
        return res.status(400).json({
          error: {
            message: 'Temperature must be a number between 0 and 2',
            type: 'invalid_request_error',
            param: 'temperature',
          },
        });
      }
    }

    if (max_tokens !== undefined) {
      if (typeof max_tokens !== 'number' || max_tokens < 1) {
        return res.status(400).json({
          error: {
            message: 'max_tokens must be a positive integer',
            type: 'invalid_request_error',
            param: 'max_tokens',
          },
        });
      }
    }

    if (top_p !== undefined) {
      if (typeof top_p !== 'number' || top_p < 0 || top_p > 1) {
        return res.status(400).json({
          error: {
            message: 'top_p must be a number between 0 and 1',
            type: 'invalid_request_error',
            param: 'top_p',
          },
        });
      }
    }

    if (frequency_penalty !== undefined) {
      if (
        typeof frequency_penalty !== 'number' ||
        frequency_penalty < -2 ||
        frequency_penalty > 2
      ) {
        return res.status(400).json({
          error: {
            message: 'frequency_penalty must be a number between -2 and 2',
            type: 'invalid_request_error',
            param: 'frequency_penalty',
          },
        });
      }
    }

    if (presence_penalty !== undefined) {
      if (typeof presence_penalty !== 'number' || presence_penalty < -2 || presence_penalty > 2) {
        return res.status(400).json({
          error: {
            message: 'presence_penalty must be a number between -2 and 2',
            type: 'invalid_request_error',
            param: 'presence_penalty',
          },
        });
      }
    }

    if (n !== undefined) {
      if (typeof n !== 'number' || n < 1 || n > 10 || !Number.isInteger(n)) {
        return res.status(400).json({
          error: {
            message: 'n must be an integer between 1 and 10',
            type: 'invalid_request_error',
            param: 'n',
          },
        });
      }
    }

    logger.debug('[OpenRouter Validation] Request validation passed');
    next();
  } catch (error) {
    logger.error('[OpenRouter Validation] Error validating request:', error);
    return res.status(500).json({
      error: {
        message: 'Error validating request',
        type: 'internal_error',
      },
    });
  }
};

/**
 * Rate limiting middleware for OpenRouter endpoints
 */
const rateLimitOpenRouter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute per user
  message: {
    error: {
      message: 'Too many requests, please try again later.',
      type: 'rate_limit_error',
      code: 'rate_limit_exceeded',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use user ID if available, otherwise use IP
    return req.user?.id || req.ip;
  },
  handler: (req, res) => {
    logger.warn(`[OpenRouter Rate Limit] User ${req.user?.id || req.ip} exceeded rate limit`);
    res.status(429).json({
      error: {
        message: 'Too many requests, please try again later.',
        type: 'rate_limit_error',
        code: 'rate_limit_exceeded',
      },
    });
  },
});

module.exports = {
  validateOpenRouterKey,
  validateChatCompletion,
  rateLimitOpenRouter,
};
