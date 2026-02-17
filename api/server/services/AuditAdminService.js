const { logger } = require('~/config');

/**
 * Audit Admin Service
 * Proxies requests to external Audit Platform API
 *
 * This service handles all communication with the external audit platform,
 * including authentication, error handling, and response formatting.
 */
class AuditAdminService {
  constructor() {
    this.baseUrl = process.env.AUDIT_ADMIN_API_URL;
    this.apiSecret = process.env.ADMIN_API_SECRET;

    // Log warnings if not configured (only if audit feature is enabled)
    if (!this.baseUrl) {
      logger.warn('[AuditAdminService] AUDIT_ADMIN_API_URL not configured');
    }
    if (!this.apiSecret) {
      logger.warn('[AuditAdminService] ADMIN_API_SECRET not configured');
    }
  }

  /**
   * Check if service is properly configured
   * @returns {boolean}
   */
  isConfigured() {
    return !!(this.baseUrl && this.apiSecret);
  }

  /**
   * List all audits with optional filters
   * @param {Object} filters - Query filters
   * @param {string} [filters.userId] - Filter by user ID
   * @param {string} [filters.status] - Filter by session status
   * @param {boolean} [filters.approved] - Filter by approval status
   * @param {number} [filters.limit] - Results per page
   * @param {number} [filters.offset] - Skip N results
   * @returns {Promise<Object>}
   */
  async listAudits(filters = {}) {
    const queryParams = new URLSearchParams();

    if (filters.userId) queryParams.append('userId', filters.userId);
    if (filters.status) queryParams.append('status', filters.status);
    if (filters.approved !== undefined) queryParams.append('approved', String(filters.approved));
    if (filters.limit) queryParams.append('limit', String(filters.limit));
    if (filters.offset) queryParams.append('offset', String(filters.offset));

    const url = `${this.baseUrl}/audits?${queryParams.toString()}`;
    return this.callAPI('GET', url);
  }

  /**
   * Get audit details by session ID
   * @param {string} sessionId - Audit session ID
   * @returns {Promise<Object>}
   */
  async getAuditDetails(sessionId) {
    const url = `${this.baseUrl}/audits/${sessionId}`;
    return this.callAPI('GET', url);
  }

  /**
   * Edit audit report
   * @param {string} sessionId - Audit session ID
   * @param {Object} reportData - Report content
   * @param {string} reportData.executiveSummary - Executive summary
   * @param {Array} reportData.painPoints - Pain points list
   * @param {Array} reportData.recommendations - Recommendations list
   * @param {Array} reportData.quickWins - Quick wins list
   * @param {Array} reportData.longTermInitiatives - Long term initiatives
   * @param {Object} reportData.estimatedROI - ROI estimates
   * @param {string} reportData.changeNotes - Required: notes about the changes
   * @param {string} adminId - Admin identifier (email or user ID)
   * @returns {Promise<Object>}
   */
  async editReport(sessionId, reportData, adminId) {
    if (!reportData.changeNotes) {
      throw new Error('Change notes are required when editing a report');
    }

    const url = `${this.baseUrl}/audits/${sessionId}`;
    return this.callAPI('PUT', url, reportData, { 'X-Admin-ID': adminId });
  }

  /**
   * Approve audit report (sends email to user)
   * @param {string} sessionId - Audit session ID
   * @param {string} adminId - Admin identifier (email or user ID)
   * @param {string} [message=''] - Optional message to user
   * @returns {Promise<Object>}
   */
  async approveReport(sessionId, adminId, message = '') {
    const url = `${this.baseUrl}/audits/${sessionId}/approve`;
    return this.callAPI('PATCH', url, { message }, { 'X-Admin-ID': adminId });
  }

  /**
   * List users with optional search
   * @param {Object} options - Search and pagination options
   * @param {string} [options.search] - Search by email or name
   * @param {number} [options.limit] - Results per page
   * @param {number} [options.offset] - Skip N results
   * @returns {Promise<Object>}
   */
  async listUsers(options = {}) {
    const queryParams = new URLSearchParams();

    if (options.search) queryParams.append('search', options.search);
    if (options.limit) queryParams.append('limit', String(options.limit));
    if (options.offset) queryParams.append('offset', String(options.offset));

    const url = `${this.baseUrl}/users?${queryParams.toString()}`;
    return this.callAPI('GET', url);
  }

  /**
   * Generic API call method
   * Handles authentication, request formatting, and error handling
   * @private
   * @param {string} method - HTTP method
   * @param {string} url - Full URL to call
   * @param {Object|null} body - Request body (for POST/PUT/PATCH)
   * @param {Object} extraHeaders - Additional headers
   * @returns {Promise<Object>}
   */
  async callAPI(method, url, body = null, extraHeaders = {}) {
    // Check if configured
    if (!this.isConfigured()) {
      throw {
        status: 500,
        message: 'Audit Admin API is not configured',
        details: 'AUDIT_ADMIN_API_URL and ADMIN_API_SECRET must be set in environment',
      };
    }

    try {
      const options = {
        method,
        headers: {
          'Authorization': `Bearer ${this.apiSecret}`,
          'Content-Type': 'application/json',
          ...extraHeaders,
        },
      };

      if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        options.body = JSON.stringify(body);
      }

      logger.info(`[AuditAdminService] ${method} ${url}`);

      const response = await fetch(url, options);
      const data = await response.json();

      if (!response.ok) {
        logger.error(`[AuditAdminService] API Error ${response.status}:`, data);
        throw {
          status: response.status,
          message: data.error || data.message || 'API request failed',
          details: data,
        };
      }

      logger.debug(`[AuditAdminService] Success: ${method} ${url}`);
      return data;
    } catch (error) {
      // If error already has status (from above), re-throw it
      if (error.status) {
        throw error;
      }

      // Network or other errors
      logger.error('[AuditAdminService] Request failed:', error);
      throw {
        status: 500,
        message: 'Failed to communicate with audit platform',
        details: error.message,
      };
    }
  }

  /**
   * Health check for audit platform API
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    try {
      const url = `${this.baseUrl}/health`;
      await this.callAPI('GET', url);
      return true;
    } catch (error) {
      logger.error('[AuditAdminService] Health check failed:', error);
      return false;
    }
  }
}

// Singleton instance
const auditAdminService = new AuditAdminService();

module.exports = auditAdminService;
