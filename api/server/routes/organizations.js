const express = require('express');
const cookies = require('cookie');
const { SystemCapabilities } = require('@librechat/data-schemas');
const {
  createOrganizationHandlers,
  requireOrganizationsEnabled,
  createCurrentSessionRevoker,
  createOrganizationAccountAuth,
} = require('@librechat/api');
const {
  organizationCreateLimiter,
  organizationInviteIpLimiter,
  organizationInviteUserLimiter,
} = require('~/server/middleware/limiters/organizationLimiters');
const { findAuthSession, deleteAuthSession } = require('~/server/services/AuthSessions');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { organizations, invites } = require('~/server/services/Organizations');
const { issueAuthTokens } = require('~/server/services/AuthService');
const { requireJwtAuth, requireSameOrigin } = require('~/server/middleware');
const { getUserById } = require('~/models');

const handlers = createOrganizationHandlers({
  organizations,
  invites,
  issueAuthTokens,
  revokeCurrentSession: createCurrentSessionRevoker({
    readRefreshToken: (req) => cookies.parse(req.headers.cookie ?? '').refreshToken,
    findSession: findAuthSession,
    deleteSession: deleteAuthSession,
  }),
});
const requireAccount = createOrganizationAccountAuth({ requireJwtAuth, getUserById });
const canReadMembers = requireCapability(SystemCapabilities.READ_USERS);
const canManageMembers = requireCapability(SystemCapabilities.MANAGE_USERS);

const router = express.Router();
router.use(requireOrganizationsEnabled);

/* Before sign-in: what an invite link opens. */
router.get('/invites/:token', organizationInviteIpLimiter, handlers.previewInvite);

/* For the login account: from a member session or an onboarding token. */
router.get('/', requireAccount, handlers.listOrganizations);
router.post(
  '/',
  requireSameOrigin,
  requireAccount,
  organizationCreateLimiter,
  handlers.createOrganization,
);
router.get('/pending-invites', requireAccount, handlers.listPendingInvites);
router.post(
  '/pending-invites/:inviteId/accept',
  requireSameOrigin,
  requireAccount,
  handlers.acceptPendingInvite,
);
router.post(
  '/invites/:token/accept',
  requireSameOrigin,
  organizationInviteIpLimiter,
  requireAccount,
  handlers.acceptInvite,
);
router.post('/switch', requireSameOrigin, requireAccount, handlers.switchOrganization);

/* Inside the current organization. */
router.get('/current', requireJwtAuth, handlers.getCurrentOrganization);
router.patch('/current', requireJwtAuth, canManageMembers, handlers.renameOrganization);
router.post('/current/leave', requireSameOrigin, requireJwtAuth, handlers.leaveOrganization);
router.get('/current/members', requireJwtAuth, canReadMembers, handlers.listMembers);
router.patch('/current/members/:memberId', requireJwtAuth, canManageMembers, handlers.updateMember);
router.delete(
  '/current/members/:memberId',
  requireJwtAuth,
  canManageMembers,
  handlers.deactivateMember,
);
router.get('/current/invites', requireJwtAuth, canManageMembers, handlers.listInvites);
router.post(
  '/current/invites',
  requireJwtAuth,
  canManageMembers,
  organizationInviteUserLimiter,
  handlers.createInvite,
);
router.delete(
  '/current/invites/:inviteId',
  requireJwtAuth,
  canManageMembers,
  handlers.revokeInvite,
);
router.post(
  '/current/invites/:inviteId/resend',
  requireJwtAuth,
  canManageMembers,
  organizationInviteUserLimiter,
  handlers.resendInvite,
);

module.exports = router;
