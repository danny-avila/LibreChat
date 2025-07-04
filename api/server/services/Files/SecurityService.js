const { logger } = require('~/config');
const path = require('path');

/**
 * Security Service for temporary file downloads
 * Handles IP whitelisting, file type restrictions, file size limits, and security logging
 */
class SecurityService {
  constructor() {
    this.config = {
      // Global feature toggle
      enabled: process.env.TEMP_DOWNLOAD_ENABLED !== 'false',

      // IP whitelisting
      allowedIPs: this.parseAllowedIPs(process.env.TEMP_DOWNLOAD_ALLOWED_IPS),
      enforceIPWhitelist: process.env.TEMP_DOWNLOAD_ENFORCE_IP_WHITELIST === 'true',

      // File restrictions
      maxFileSize: parseInt(process.env.TEMP_DOWNLOAD_MAX_FILE_SIZE) || 104857600, // 100MB
      allowedTypes: this.parseAllowedTypes(process.env.TEMP_DOWNLOAD_ALLOWED_TYPES),

      // Security logging
      detailedLogging: process.env.TEMP_DOWNLOAD_DETAILED_LOGGING !== 'false',
      logAttempts: process.env.TEMP_DOWNLOAD_LOG_ATTEMPTS !== 'false',
      logSecurityEvents: process.env.TEMP_DOWNLOAD_LOG_SECURITY_EVENTS !== 'false',

      // Development settings
      allowInsecure: process.env.TEMP_DOWNLOAD_DEV_ALLOW_INSECURE === 'true',
      debug: process.env.TEMP_DOWNLOAD_DEBUG === 'true'
    };

    logger.info('[SecurityService] Initialized with config:', {
      ipWhitelistEnabled: this.config.enforceIPWhitelist,
      allowedIPsCount: this.config.allowedIPs.length,
      maxFileSize: this.config.maxFileSize,
      allowedTypesCount: this.config.allowedTypes.length,
      detailedLogging: this.config.detailedLogging,
      allowInsecure: this.config.allowInsecure
    });
  }

  /**
   * Parse allowed IPs from environment variable
   */
  parseAllowedIPs(allowedIPsStr) {
    if (!allowedIPsStr || allowedIPsStr.trim() === '') {
      return [];
    }

    return allowedIPsStr.split(',')
      .map(ip => ip.trim())
      .filter(ip => ip.length > 0);
  }

  /**
   * Parse allowed file types from environment variable
   */
  parseAllowedTypes(allowedTypesStr) {
    if (!allowedTypesStr || allowedTypesStr.trim() === '') {
      return []; // Empty array means all types allowed
    }

    return allowedTypesStr.split(',')
      .map(type => type.trim().toLowerCase())
      .filter(type => type.length > 0);
  }

  /**
   * Check if IP address is allowed
   */
  isIPAllowed(clientIP) {
    if (!this.config.enforceIPWhitelist) {
      return true;
    }

    if (this.config.allowedIPs.length === 0) {
      return true; // No restrictions if no IPs configured
    }

    // Check exact matches
    if (this.config.allowedIPs.includes(clientIP)) {
      return true;
    }

    // Check CIDR ranges and IP ranges
    for (const allowedIP of this.config.allowedIPs) {
      if (this.isIPInRange(clientIP, allowedIP)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if IP is in a range (CIDR or range notation)
   */
  isIPInRange(ip, range) {
    try {
      // Handle CIDR notation (e.g., 192.168.1.0/24)
      if (range.includes('/')) {
        return this.isIPInCIDR(ip, range);
      }

      // Handle range notation (e.g., 192.168.1.1-192.168.1.100)
      if (range.includes('-')) {
        return this.isIPInIPRange(ip, range);
      }

      // Exact match
      return ip === range;
    } catch (error) {
      logger.error('[SecurityService] Error checking IP range:', error);
      return false;
    }
  }

  /**
   * Check if IP is in CIDR range
   */
  isIPInCIDR(ip, cidr) {
    const [network, prefixLength] = cidr.split('/');
    const prefix = parseInt(prefixLength);
    
    // Simple IPv4 CIDR check (basic implementation)
    const ipParts = ip.split('.').map(Number);
    const networkParts = network.split('.').map(Number);
    
    if (ipParts.length !== 4 || networkParts.length !== 4) {
      return false;
    }
    
    const ipInt = (ipParts[0] << 24) + (ipParts[1] << 16) + (ipParts[2] << 8) + ipParts[3];
    const networkInt = (networkParts[0] << 24) + (networkParts[1] << 16) + (networkParts[2] << 8) + networkParts[3];
    const mask = (-1 << (32 - prefix)) >>> 0;
    
    return (ipInt & mask) === (networkInt & mask);
  }

  /**
   * Check if IP is in IP range
   */
  isIPInIPRange(ip, range) {
    const [startIP, endIP] = range.split('-').map(s => s.trim());
    
    const ipToInt = (ipStr) => {
      const parts = ipStr.split('.').map(Number);
      return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
    };
    
    const ipInt = ipToInt(ip);
    const startInt = ipToInt(startIP);
    const endInt = ipToInt(endIP);
    
    return ipInt >= startInt && ipInt <= endInt;
  }

  /**
   * Check if file type is allowed
   */
  isFileTypeAllowed(filename, mimeType) {
    if (this.config.allowedTypes.length === 0) {
      return true; // All types allowed if none specified
    }

    // Get file extension
    const ext = path.extname(filename).toLowerCase().substring(1);
    
    // Check extension
    if (this.config.allowedTypes.includes(ext)) {
      return true;
    }

    // Check MIME type
    if (mimeType && this.config.allowedTypes.includes(mimeType.toLowerCase())) {
      return true;
    }

    // Check MIME type category (e.g., 'image' for 'image/jpeg')
    if (mimeType) {
      const mimeCategory = mimeType.split('/')[0].toLowerCase();
      if (this.config.allowedTypes.includes(mimeCategory)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if file size is allowed
   */
  isFileSizeAllowed(fileSize) {
    return fileSize <= this.config.maxFileSize;
  }

  /**
   * Validate download request security
   */
  validateDownloadRequest(params) {
    const { clientIP, filename, fileSize, mimeType, userId, requestId } = params;
    const violations = [];

    // Check IP whitelist
    if (!this.isIPAllowed(clientIP)) {
      violations.push({
        type: 'ip_not_allowed',
        message: 'IP address not in whitelist',
        clientIP
      });
    }

    // Check file type
    if (!this.isFileTypeAllowed(filename, mimeType)) {
      violations.push({
        type: 'file_type_not_allowed',
        message: 'File type not allowed',
        filename,
        mimeType
      });
    }

    // Check file size
    if (!this.isFileSizeAllowed(fileSize)) {
      violations.push({
        type: 'file_size_exceeded',
        message: 'File size exceeds maximum allowed',
        fileSize,
        maxSize: this.config.maxFileSize
      });
    }

    // Log security events
    if (violations.length > 0 && this.config.logSecurityEvents) {
      logger.warn('[SecurityService] Security violations detected:', {
        clientIP,
        userId,
        requestId,
        violations,
        filename,
        fileSize,
        mimeType
      });
    }

    return {
      allowed: violations.length === 0 || this.config.allowInsecure,
      violations
    };
  }

  /**
   * Log download attempt
   */
  logDownloadAttempt(params) {
    if (!this.config.logAttempts) {
      return;
    }

    const { success, clientIP, userId, fileId, filename, error, requestId } = params;

    if (this.config.detailedLogging) {
      logger.info('[SecurityService] Download attempt:', {
        success,
        clientIP,
        userId,
        fileId,
        filename,
        error: error?.message,
        requestId,
        timestamp: new Date().toISOString()
      });
    } else {
      logger.info(`[SecurityService] Download ${success ? 'success' : 'failed'}: ${fileId}`, {
        clientIP,
        userId,
        requestId
      });
    }
  }

  /**
   * Log security event
   */
  logSecurityEvent(event) {
    if (!this.config.logSecurityEvents) {
      return;
    }

    logger.warn('[SecurityService] Security event:', {
      ...event,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get security statistics
   */
  getSecurityStats() {
    return {
      config: {
        ipWhitelistEnabled: this.config.enforceIPWhitelist,
        allowedIPsCount: this.config.allowedIPs.length,
        maxFileSize: this.config.maxFileSize,
        allowedTypesCount: this.config.allowedTypes.length,
        allowInsecure: this.config.allowInsecure
      },
      // Additional stats could be added here
    };
  }

  /**
   * Create Express middleware for security validation
   */
  createValidationMiddleware() {
    return (req, res, next) => {
      try {
        // Check if temporary downloads are globally enabled
        if (!this.config.enabled) {
          return res.status(503).json({
            error: 'Temporary downloads are disabled',
            code: 'FEATURE_DISABLED'
          });
        }

        const clientIP = req.ip || req.connection.remoteAddress;
        const requestId = req.headers['x-request-id'] || `req-${Date.now()}`;

        // Basic IP validation
        if (!this.isIPAllowed(clientIP)) {
          this.logSecurityEvent({
            type: 'ip_blocked',
            clientIP,
            userId: req.user?.id,
            requestId,
            userAgent: req.get('User-Agent')
          });

          return res.status(403).json({
            error: 'Access denied',
            code: 'IP_NOT_ALLOWED'
          });
        }

        next();
      } catch (error) {
        logger.error('[SecurityService] Validation middleware error:', error);
        // Fail open for middleware errors
        next();
      }
    };
  }
}

// Create singleton instance
const securityService = new SecurityService();

module.exports = securityService;
