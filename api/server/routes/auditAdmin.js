const express = require('express');
const AuditAdminController = require('~/server/controllers/AuditAdminController');

const router = express.Router();

/**
 * Audit Admin Routes
 * All routes require:
 * - JWT authentication (requireJwtAuth)
 * - CEO profile (requireCeoProfile)
 * - Audit feature enabled (requireFeature('audit'))
 *
 * These guards are applied in routes/index.js when registering this router
 */

/**
 * GET /api/admin/audits
 * List all audits with optional filters
 *
 * Query parameters:
 * - userId: Filter by user ID
 * - status: Filter by session status (PAID, COMPLETED, PROCESSED, etc.)
 * - approved: Filter by approval status (true/false)
 * - limit: Results per page (default: 50, max: 100)
 * - offset: Skip N results (default: 0)
 *
 * Response:
 * {
 *   audits: [...],
 *   pagination: { total, limit, offset, hasMore }
 * }
 */
router.get('/', AuditAdminController.listAudits);

/**
 * GET /api/admin/audits/users
 * List users with search
 *
 * Query parameters:
 * - search: Search by email or name
 * - limit: Results per page (default: 50, max: 100)
 * - offset: Skip N results (default: 0)
 *
 * Response:
 * {
 *   users: [...],
 *   pagination: { total, limit, offset, hasMore }
 * }
 */
router.get('/users', AuditAdminController.listUsers);

/**
 * GET /api/admin/audits/health
 * Health check for audit platform API
 *
 * Response:
 * {
 *   healthy: true/false,
 *   service: 'Audit Platform API',
 *   configured: true/false
 * }
 */
router.get('/health', AuditAdminController.healthCheck);

/**
 * GET /api/admin/audits/:sessionId
 * Get audit details
 *
 * Response:
 * {
 *   id, userId, status, createdAt, updatedAt,
 *   user: { id, email, name },
 *   report: { ... }
 * }
 */
router.get('/:sessionId', AuditAdminController.getAuditDetails);

/**
 * PUT /api/admin/audits/:sessionId
 * Edit audit report
 *
 * Body:
 * {
 *   executiveSummary: string,
 *   painPoints: [...],
 *   recommendations: [...],
 *   quickWins: [...],
 *   longTermInitiatives: [...],
 *   estimatedROI: { ... },
 *   changeNotes: string (REQUIRED)
 * }
 *
 * Response:
 * {
 *   success: true,
 *   reportId: string,
 *   versionNumber: number
 * }
 */
router.put('/:sessionId', AuditAdminController.editReport);

/**
 * PATCH /api/admin/audits/:sessionId/approve
 * Approve audit report (sends email to user)
 *
 * Body:
 * {
 *   message?: string (optional message to user)
 * }
 *
 * Response:
 * {
 *   success: true,
 *   reportId: string,
 *   emailSent: boolean,
 *   message: string
 * }
 */
router.patch('/:sessionId/approve', AuditAdminController.approveReport);

module.exports = router;
