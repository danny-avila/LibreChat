/**
 * Environment variable validation and security checks
 * Ensures all required variables are present and properly formatted
 */

const { maskAPIKey } = require('./keyMasking');
const { logger } = require('~/config');

/**
 * API key format validators for different providers
 */
const API_KEY_VALIDATORS = {
  OPENAI_API_KEY: {
    pattern: /^sk-(proj-)?[a-zA-Z0-9\-_]{20,}$/,
    description: 'OpenAI API key (should start with sk- or sk-proj-)',
    optional: true,
  },
  OPENROUTER_API_KEY: {
    pattern: /^sk-or-v\d-[a-zA-Z0-9]{20,}$/,
    description: 'OpenRouter API key (should start with sk-or-v)',
    optional: true,
  },
  ANTHROPIC_API_KEY: {
    pattern: /^sk-ant-[a-zA-Z0-9\-_]{20,}$/,
    description: 'Anthropic API key (should start with sk-ant-)',
    optional: true,
  },
  GOOGLE_API_KEY: {
    pattern: /^[A-Za-z0-9\-_]{39}$/,
    description: 'Google API key',
    optional: true,
  },
  AZURE_API_KEY: {
    pattern: /^[a-f0-9]{32}$/,
    description: 'Azure API key (32 character hex string)',
    optional: true,
  },
};

/**
 * Required environment variables
 */
const REQUIRED_ENV_VARS = [
  'PORT',
  'MONGO_URI',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'CREDS_KEY',
  'CREDS_IV',
];

/**
 * Validates a single API key
 * @param {string} key - The environment variable key
 * @param {string} value - The API key value
 * @returns {Object} Validation result
 */
function validateAPIKey(key, value) {
  const validator = API_KEY_VALIDATORS[key];

  if (!validator) {
    return { valid: true }; // No validation for this key
  }

  if (!value) {
    return {
      valid: validator.optional,
      error: validator.optional ? null : `${key} is required but not set`,
    };
  }

  // Special case: 'user_provided' is a valid value
  if (value === 'user_provided') {
    return { valid: true };
  }

  if (!validator.pattern.test(value)) {
    return {
      valid: false,
      error: `${key} appears to be malformed. Expected format: ${validator.description}`,
      masked: maskAPIKey(value),
    };
  }

  return { valid: true };
}

/**
 * Validates all environment variables
 * @returns {Object} Validation results
 */
function validateEnvironment() {
  const errors = [];
  const warnings = [];

  // Check required variables
  for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName]) {
      errors.push(`Missing required environment variable: ${varName}`);
    }
  }

  // Validate API keys
  for (const [key, validator] of Object.entries(API_KEY_VALIDATORS)) {
    const value = process.env[key];
    const result = validateAPIKey(key, value);

    if (!result.valid && result.error) {
      if (validator.optional) {
        warnings.push(result.error);
      } else {
        errors.push(result.error);
      }
    } else if (result.valid && value && value !== 'user_provided') {
      // Log successful validation with masked key
      logger.debug(`${key} validated successfully: ${maskAPIKey(value)}`);
    }
  }

  // Check for deprecated environment variables
  const deprecated = {
    OPENROUTER_KEY: 'Use OPENROUTER_API_KEY instead',
    OPENAI_KEY: 'Use OPENAI_API_KEY instead',
  };

  for (const [oldKey, message] of Object.entries(deprecated)) {
    if (process.env[oldKey]) {
      warnings.push(`Deprecated environment variable ${oldKey}: ${message}`);
    }
  }

  // Security checks
  if (process.env.NODE_ENV === 'production') {
    // In production, certain variables should be set
    if (!process.env.DOMAIN_CLIENT || process.env.DOMAIN_CLIENT === 'http://localhost:3080') {
      warnings.push('DOMAIN_CLIENT is not set for production or is using localhost');
    }

    if (process.env.JWT_SECRET === 'secret' || process.env.JWT_SECRET?.length < 32) {
      errors.push('JWT_SECRET is too weak for production use');
    }

    if (process.env.CREDS_KEY?.length < 32 || process.env.CREDS_IV?.length < 32) {
      errors.push('CREDS_KEY and CREDS_IV should be at least 32 characters in production');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates environment on startup and logs results
 * @param {boolean} exitOnError - Whether to exit process on validation errors
 */
function validateOnStartup(exitOnError = false) {
  logger.info('Validating environment variables...');

  const validation = validateEnvironment();

  // Log warnings
  validation.warnings.forEach(warning => {
    logger.warn(`⚠️  ${warning}`);
  });

  // Log errors
  validation.errors.forEach(error => {
    logger.error(`❌ ${error}`);
  });

  if (!validation.valid) {
    logger.error('Environment validation failed. Please check your configuration.');

    if (exitOnError) {
      process.exit(1);
    }
  } else if (validation.warnings.length === 0) {
    logger.info('✅ Environment validation passed successfully');
  } else {
    logger.info('✅ Environment validation passed with warnings');
  }

  return validation;
}

/**
 * Creates a safe environment object with masked sensitive values
 * Useful for debugging or admin panels
 * @returns {Object} Masked environment variables
 */
function getSafeEnvironment() {
  const safeEnv = {};

  for (const [key, value] of Object.entries(process.env)) {
    // Check if this looks like a sensitive key
    const isSensitive = /api[_-]?key|secret|password|token|cred/i.test(key);

    if (isSensitive && value) {
      safeEnv[key] = maskAPIKey(value);
    } else {
      safeEnv[key] = value;
    }
  }

  return safeEnv;
}

module.exports = {
  validateAPIKey,
  validateEnvironment,
  validateOnStartup,
  getSafeEnvironment,
  API_KEY_VALIDATORS,
  REQUIRED_ENV_VARS,
};