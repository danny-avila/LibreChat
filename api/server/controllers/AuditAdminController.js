const auditAdminService = require('~/server/services/AuditAdminService');
const { logger } = require('~/config');

/**
 * Audit Admin Controller
 * Handles HTTP requests for audit management endpoints
 *
 * All methods proxy to AuditAdminService which communicates with external API
 */
class AuditAdminController {
  /**
   * List all audits with filters
   * GET /api/admin/audits
   *
   * Query params:
   * - userId: Filter by user ID
   * - status: Filter by session status
   * - approved: Filter by approval status (true/false)
   * - limit: Results per page (default: 50, max: 100)
   * - offset: Skip N results (default: 0)
   */
  static async listAudits(req, res) {
    try {
      const filters = {
        userId: req.query.userId,
        status: req.query.status,
        approved: req.query.approved,
        limit: req.query.limit || '50',
        offset: req.query.offset || '0',
      };

      // Log request
      logger.info('[AuditAdminController] Listing audits', {
        userId: req.user?.id,
        filters,
      });

      const result = await auditAdminService.listAudits(filters);

      return res.json(result);
    } catch (error) {
      logger.error('[AuditAdminController] Failed to list audits:', error);

      return res.status(error.status || 500).json({
        error: error.message || 'Failed to fetch audits',
        details: error.details,
      });
    }
  }

  /**
   * Get audit details by ID
   * GET /api/admin/audits/:sessionId
   */
  static async getAuditDetails(req, res) {
    try {
      const { sessionId } = req.params;

      // Validate session ID
      if (!sessionId) {
        return res.status(400).json({
          error: 'Session ID is required',
        });
      }

      logger.info('[AuditAdminController] Getting audit details', {
        userId: req.user?.id,
        sessionId,
      });

      const audit = await auditAdminService.getAuditDetails(sessionId);

      return res.json(audit);
    } catch (error) {
      logger.error(`[AuditAdminController] Failed to get audit ${req.params.sessionId}:`, error);

      return res.status(error.status || 500).json({
        error: error.message || 'Failed to fetch audit details',
        details: error.details,
      });
    }
  }

  /**
   * Edit audit report
   * PUT /api/admin/audits/:sessionId
   *
   * Body should contain report fields and changeNotes (required)
   */
  static async editReport(req, res) {
    try {
      const { sessionId } = req.params;
      const reportData = req.body;

      // Validate session ID
      if (!sessionId) {
        return res.status(400).json({
          error: 'Session ID is required',
        });
      }

      // Validate changeNotes
      if (!reportData.changeNotes || reportData.changeNotes.trim() === '') {
        return res.status(400).json({
          error: 'Change notes are required when editing a report',
          hint: 'Include a "changeNotes" field describing your changes',
        });
      }

      // Get admin identifier from user
      const adminId = req.user.email || req.user.username || req.user.id;

      logger.info('[AuditAdminController] Editing report', {
        userId: req.user?.id,
        adminId,
        sessionId,
        hasChangeNotes: !!reportData.changeNotes,
      });

      const result = await auditAdminService.editReport(
        sessionId,
        reportData,
        adminId
      );

      logger.info('[AuditAdminController] Report edited successfully', {
        sessionId,
        reportId: result.reportId,
        versionNumber: result.versionNumber,
      });

      return res.json(result);
    } catch (error) {
      logger.error(`[AuditAdminController] Failed to edit report ${req.params.sessionId}:`, error);

      return res.status(error.status || 500).json({
        error: error.message || 'Failed to update report',
        details: error.details,
      });
    }
  }

  /**
   * Approve audit report (sends email)
   * PATCH /api/admin/audits/:sessionId/approve
   *
   * Body:
   * - message: Optional message to user
   */
  static async approveReport(req, res) {
    try {
      const { sessionId } = req.params;
      const { message } = req.body;

      // Validate session ID
      if (!sessionId) {
        return res.status(400).json({
          error: 'Session ID is required',
        });
      }

      // Get admin identifier from user
      const adminId = req.user.email || req.user.username || req.user.id;

      logger.info('[AuditAdminController] Approving report', {
        userId: req.user?.id,
        adminId,
        sessionId,
        hasMessage: !!message,
      });

      const result = await auditAdminService.approveReport(
        sessionId,
        adminId,
        message
      );

      logger.info('[AuditAdminController] Report approved successfully', {
        sessionId,
        reportId: result.reportId,
        emailSent: result.emailSent,
      });

      return res.json(result);
    } catch (error) {
      logger.error(`[AuditAdminController] Failed to approve report ${req.params.sessionId}:`, error);

      return res.status(error.status || 500).json({
        error: error.message || 'Failed to approve report',
        details: error.details,
      });
    }
  }

  /**
   * List users with search
   * GET /api/admin/audits/users
   *
   * Query params:
   * - search: Search by email or name
   * - limit: Results per page (default: 50, max: 100)
   * - offset: Skip N results (default: 0)
   */
  static async listUsers(req, res) {
    try {
      const options = {
        search: req.query.search,
        limit: req.query.limit || '50',
        offset: req.query.offset || '0',
      };

      logger.info('[AuditAdminController] Listing users', {
        userId: req.user?.id,
        search: options.search,
      });

      const result = await auditAdminService.listUsers(options);

      return res.json(result);
    } catch (error) {
      logger.error('[AuditAdminController] Failed to list users:', error);

      return res.status(error.status || 500).json({
        error: error.message || 'Failed to fetch users',
        details: error.details,
      });
    }
  }

  /**
   * Health check for audit platform API
   * GET /api/admin/audits/health
   */
  static async healthCheck(req, res) {
    try {
      const isHealthy = await auditAdminService.healthCheck();

      return res.json({
        healthy: isHealthy,
        service: 'Audit Platform API',
        configured: auditAdminService.isConfigured(),
      });
    } catch (error) {
      logger.error('[AuditAdminController] Health check failed:', error);

      return res.status(500).json({
        healthy: false,
        service: 'Audit Platform API',
        configured: auditAdminService.isConfigured(),
        error: error.message,
      });
    }
  }
}

module.exports = AuditAdminController;
