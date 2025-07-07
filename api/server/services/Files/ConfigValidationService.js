const { logger } = require('~/config');

/**
 * Configuration Validation Service for temporary file downloads
 * Validates all TEMP_DOWNLOAD_ environment variables and provides warnings for misconfigurations
 */
class ConfigValidationService {
  constructor() {
    this.requiredVariables = [
      'TEMP_DOWNLOAD_SECRET_KEY'
    ];

    this.optionalVariables = [
      'TEMP_DOWNLOAD_ENABLED',
      'TEMP_DOWNLOAD_DEFAULT_TTL',
      'TEMP_DOWNLOAD_MAX_TTL',
      'TEMP_DOWNLOAD_MIN_TTL',
      'TEMP_DOWNLOAD_RATE_WINDOW',
      'TEMP_DOWNLOAD_RATE_LIMIT_IP',
      'TEMP_DOWNLOAD_RATE_LIMIT_USER',
      'TEMP_DOWNLOAD_RATE_LIMIT_FILE',
      'TEMP_DOWNLOAD_RATE_LIMIT_GLOBAL',
      'TEMP_DOWNLOAD_ALLOWED_IPS',
      'TEMP_DOWNLOAD_ENFORCE_IP_WHITELIST',
      'TEMP_DOWNLOAD_MAX_FILE_SIZE',
      'TEMP_DOWNLOAD_ALLOWED_TYPES',
      'TEMP_DOWNLOAD_MCP_ENABLED',
      'TEMP_DOWNLOAD_MCP_DEFAULT_TTL',
      'TEMP_DOWNLOAD_MCP_MAX_TTL',
      'TEMP_DOWNLOAD_MCP_RATE_LIMIT',
      'TEMP_DOWNLOAD_CLEANUP_INTERVAL',
      'TEMP_DOWNLOAD_AUDIT_RETENTION',
      'TEMP_DOWNLOAD_RATE_LIMIT_RETENTION',
      'TEMP_DOWNLOAD_AUTO_CLEANUP',
      'TEMP_DOWNLOAD_DETAILED_LOGGING',
      'TEMP_DOWNLOAD_LOG_ATTEMPTS',
      'TEMP_DOWNLOAD_LOG_SECURITY_EVENTS',
      'TEMP_DOWNLOAD_METRICS_ENABLED',
      'TEMP_DOWNLOAD_REDIS_URL',
      'TEMP_DOWNLOAD_REDIS_PREFIX',
      'TEMP_DOWNLOAD_REDIS_TIMEOUT',
      'TEMP_DOWNLOAD_DEBUG',
      'TEMP_DOWNLOAD_DEV_BYPASS_RATE_LIMIT',
      'TEMP_DOWNLOAD_DEV_ALLOW_INSECURE'
    ];

    this.validationRules = {
      'TEMP_DOWNLOAD_SECRET_KEY': {
        type: 'string',
        minLength: 32,
        required: true,
        description: 'Secret key for token generation (should be at least 32 characters)'
      },
      'TEMP_DOWNLOAD_DEFAULT_TTL': {
        type: 'number',
        min: 60,
        max: 86400,
        description: 'Default TTL in seconds (1 minute to 24 hours)'
      },
      'TEMP_DOWNLOAD_MAX_TTL': {
        type: 'number',
        min: 300,
        max: 86400,
        description: 'Maximum TTL in seconds (5 minutes to 24 hours)'
      },
      'TEMP_DOWNLOAD_MIN_TTL': {
        type: 'number',
        min: 30,
        max: 3600,
        description: 'Minimum TTL in seconds (30 seconds to 1 hour)'
      },
      'TEMP_DOWNLOAD_MAX_FILE_SIZE': {
        type: 'number',
        min: 1024,
        max: 1073741824,
        description: 'Maximum file size in bytes (1KB to 1GB)'
      }
    };
  }

  /**
   * Validate all temporary download configuration
   */
  validateConfiguration() {
    const results = {
      valid: true,
      errors: [],
      warnings: [],
      missing: [],
      configured: []
    };

    // Check required variables
    for (const variable of this.requiredVariables) {
      const value = process.env[variable];
      if (!value) {
        results.errors.push(`Required variable ${variable} is not set`);
        results.missing.push(variable);
        results.valid = false;
      } else {
        results.configured.push(variable);
        this.validateVariable(variable, value, results);
      }
    }

    // Check optional variables
    for (const variable of this.optionalVariables) {
      const value = process.env[variable];
      if (value) {
        results.configured.push(variable);
        this.validateVariable(variable, value, results);
      }
    }

    // Cross-validation checks
    this.performCrossValidation(results);

    // Log results
    this.logValidationResults(results);

    return results;
  }

  /**
   * Validate a single variable
   */
  validateVariable(variable, value, results) {
    const rule = this.validationRules[variable];
    if (!rule) return;

    try {
      if (rule.type === 'number') {
        const numValue = parseInt(value);
        if (isNaN(numValue)) {
          results.warnings.push(`${variable} should be a number, got: ${value}`);
          return;
        }

        if (rule.min !== undefined && numValue < rule.min) {
          results.warnings.push(`${variable} (${numValue}) is below recommended minimum (${rule.min})`);
        }

        if (rule.max !== undefined && numValue > rule.max) {
          results.warnings.push(`${variable} (${numValue}) is above recommended maximum (${rule.max})`);
        }
      }

      if (rule.type === 'string') {
        if (rule.minLength && value.length < rule.minLength) {
          results.warnings.push(`${variable} should be at least ${rule.minLength} characters long`);
        }

        if (variable === 'TEMP_DOWNLOAD_SECRET_KEY' && value === 'your-256-bit-secret-key-here') {
          results.warnings.push('TEMP_DOWNLOAD_SECRET_KEY is using the default value - change this in production!');
        }
      }
    } catch (error) {
      results.warnings.push(`Error validating ${variable}: ${error.message}`);
    }
  }

  /**
   * Perform cross-validation between related variables
   */
  performCrossValidation(results) {
    const minTtl = parseInt(process.env.TEMP_DOWNLOAD_MIN_TTL) || 60;
    const defaultTtl = parseInt(process.env.TEMP_DOWNLOAD_DEFAULT_TTL) || 600;
    const maxTtl = parseInt(process.env.TEMP_DOWNLOAD_MAX_TTL) || 3600;

    if (minTtl >= defaultTtl) {
      results.warnings.push('TEMP_DOWNLOAD_MIN_TTL should be less than TEMP_DOWNLOAD_DEFAULT_TTL');
    }

    if (defaultTtl >= maxTtl) {
      results.warnings.push('TEMP_DOWNLOAD_DEFAULT_TTL should be less than TEMP_DOWNLOAD_MAX_TTL');
    }

    if (minTtl >= maxTtl) {
      results.warnings.push('TEMP_DOWNLOAD_MIN_TTL should be less than TEMP_DOWNLOAD_MAX_TTL');
    }

    // MCP TTL validation
    const mcpDefaultTtl = parseInt(process.env.TEMP_DOWNLOAD_MCP_DEFAULT_TTL) || 900;
    const mcpMaxTtl = parseInt(process.env.TEMP_DOWNLOAD_MCP_MAX_TTL) || 1800;

    if (mcpDefaultTtl >= mcpMaxTtl) {
      results.warnings.push('TEMP_DOWNLOAD_MCP_DEFAULT_TTL should be less than TEMP_DOWNLOAD_MCP_MAX_TTL');
    }

    // Rate limiting validation
    const ipLimit = parseInt(process.env.TEMP_DOWNLOAD_RATE_LIMIT_IP) || 100;
    const userLimit = parseInt(process.env.TEMP_DOWNLOAD_RATE_LIMIT_USER) || 50;
    const fileLimit = parseInt(process.env.TEMP_DOWNLOAD_RATE_LIMIT_FILE) || 10;

    if (userLimit > ipLimit) {
      results.warnings.push('TEMP_DOWNLOAD_RATE_LIMIT_USER should typically be less than or equal to TEMP_DOWNLOAD_RATE_LIMIT_IP');
    }

    if (fileLimit > userLimit) {
      results.warnings.push('TEMP_DOWNLOAD_RATE_LIMIT_FILE should typically be less than or equal to TEMP_DOWNLOAD_RATE_LIMIT_USER');
    }
  }

  /**
   * Log validation results
   */
  logValidationResults(results) {
    try {
      if (results.valid) {
        logger.info('[ConfigValidation] Temporary download configuration is valid', {
          configuredVariables: results.configured.length,
          warnings: results.warnings.length
        });
      } else {
        logger.error('[ConfigValidation] Temporary download configuration has errors', {
          errors: results.errors.length,
          warnings: results.warnings.length,
          missing: results.missing
        });
      }

      // Log errors
      for (const error of results.errors) {
        logger.error(`[ConfigValidation] ERROR: ${error}`);
      }

      // Log warnings
      for (const warning of results.warnings) {
        logger.warn(`[ConfigValidation] WARNING: ${warning}`);
      }

      // Log missing optional variables in debug mode
      if (process.env.TEMP_DOWNLOAD_DEBUG === 'true') {
        const missingOptional = this.optionalVariables.filter(v => !process.env[v]);
        if (missingOptional.length > 0) {
          logger.debug('[ConfigValidation] Missing optional variables (using defaults):', missingOptional);
        }
      }
    } catch (error) {
      // Fallback to console if logger is not available
      console.error('[ConfigValidation] Logger error:', error.message);
      console.log('[ConfigValidation] Validation results:', JSON.stringify(results, null, 2));
    }
  }

  /**
   * Get configuration summary
   */
  getConfigurationSummary() {
    const summary = {
      enabled: process.env.TEMP_DOWNLOAD_ENABLED !== 'false',
      security: {
        secretKeyConfigured: !!process.env.TEMP_DOWNLOAD_SECRET_KEY,
        ipWhitelistEnabled: process.env.TEMP_DOWNLOAD_ENFORCE_IP_WHITELIST === 'true',
        allowedIPs: process.env.TEMP_DOWNLOAD_ALLOWED_IPS ? 
          process.env.TEMP_DOWNLOAD_ALLOWED_IPS.split(',').length : 0,
        maxFileSize: parseInt(process.env.TEMP_DOWNLOAD_MAX_FILE_SIZE) || 104857600,
        allowedTypes: process.env.TEMP_DOWNLOAD_ALLOWED_TYPES ? 
          process.env.TEMP_DOWNLOAD_ALLOWED_TYPES.split(',').length : 0
      },
      rateLimiting: {
        ipLimit: parseInt(process.env.TEMP_DOWNLOAD_RATE_LIMIT_IP) || 100,
        userLimit: parseInt(process.env.TEMP_DOWNLOAD_RATE_LIMIT_USER) || 50,
        fileLimit: parseInt(process.env.TEMP_DOWNLOAD_RATE_LIMIT_FILE) || 10,
        globalLimit: parseInt(process.env.TEMP_DOWNLOAD_RATE_LIMIT_GLOBAL) || 1000,
        window: parseInt(process.env.TEMP_DOWNLOAD_RATE_WINDOW) || 3600
      },
      mcp: {
        enabled: process.env.TEMP_DOWNLOAD_MCP_ENABLED !== 'false',
        defaultTtl: parseInt(process.env.TEMP_DOWNLOAD_MCP_DEFAULT_TTL) || 900,
        maxTtl: parseInt(process.env.TEMP_DOWNLOAD_MCP_MAX_TTL) || 1800,
        rateLimit: parseInt(process.env.TEMP_DOWNLOAD_MCP_RATE_LIMIT) || 200
      },
      cleanup: {
        enabled: process.env.TEMP_DOWNLOAD_AUTO_CLEANUP !== 'false',
        interval: parseInt(process.env.TEMP_DOWNLOAD_CLEANUP_INTERVAL) || 300,
        auditRetention: parseInt(process.env.TEMP_DOWNLOAD_AUDIT_RETENTION) || 7776000
      },
      logging: {
        detailed: process.env.TEMP_DOWNLOAD_DETAILED_LOGGING !== 'false',
        attempts: process.env.TEMP_DOWNLOAD_LOG_ATTEMPTS !== 'false',
        security: process.env.TEMP_DOWNLOAD_LOG_SECURITY_EVENTS !== 'false',
        metrics: process.env.TEMP_DOWNLOAD_METRICS_ENABLED === 'true',
        debug: process.env.TEMP_DOWNLOAD_DEBUG === 'true'
      },
      redis: {
        configured: !!process.env.TEMP_DOWNLOAD_REDIS_URL,
        prefix: process.env.TEMP_DOWNLOAD_REDIS_PREFIX || 'librechat:downloads:',
        timeout: parseInt(process.env.TEMP_DOWNLOAD_REDIS_TIMEOUT) || 5000
      },
      development: {
        bypassRateLimit: process.env.TEMP_DOWNLOAD_DEV_BYPASS_RATE_LIMIT === 'true',
        allowInsecure: process.env.TEMP_DOWNLOAD_DEV_ALLOW_INSECURE === 'true'
      }
    };

    return summary;
  }
}

// Lazy singleton instance
let configValidationService = null;

function getConfigValidationService() {
  if (!configValidationService) {
    configValidationService = new ConfigValidationService();
  }
  return configValidationService;
}

// Export the factory function and the class
module.exports = {
  ConfigValidationService,
  getInstance: getConfigValidationService,
  // For backward compatibility, also export common methods
  validateConfiguration: () => getConfigValidationService().validateConfiguration(),
  getConfigurationSummary: () => getConfigValidationService().getConfigurationSummary()
};
