const express = require('express');
const {
  listUsersController,
  createAdminUserController,
  updateUserRoleController,
  updateUserGroupsController,
  deleteUserByAdminController,
  listAllConversationsController,
  getConversationMessagesController,
  listGroupsController,
  createGroupController,
  deleteGroupController,
  getUsersByGroupController,
} = require('~/server/controllers/AdminController');
const { requireJwtAuth, checkAdmin } = require('~/server/middleware');

const router = express.Router();

// All admin routes require authentication and admin role
router.use(requireJwtAuth);
router.use(checkAdmin);

/**
 * @route GET /api/admin/users
 * @desc Get list of all users (with pagination and search)
 * @access Admin only
 */
router.get('/users', listUsersController);

/**
 * @route POST /api/admin/users
 * @desc Create a new admin user
 * @access Admin only
 */
router.post('/users', createAdminUserController);

/**
 * @route PATCH /api/admin/users/:userId/role
 * @desc Update user role
 * @access Admin only
 */
router.patch('/users/:userId/role', updateUserRoleController);

/**
 * @route PATCH /api/admin/users/:userId/groups
 * @desc Update user groups (add user to multiple groups)
 * @access Admin only
 */
router.patch('/users/:userId/groups', updateUserGroupsController);

/**
 * @route DELETE /api/admin/users/:userId
 * @desc Delete a user
 * @access Admin only
 */
router.delete('/users/:userId', deleteUserByAdminController);

/**
 * @route GET /api/admin/conversations
 * @desc Get all users' assistant/agent conversations (with pagination, filtering, and search)
 * @access Admin only
 * @query {number} page - Page number (default: 1)
 * @query {number} limit - Items per page (default: 20)
 * @query {string} userId - Filter by user ID
 * @query {string} endpoint - Filter by endpoint (assistants, azureAssistants, agents)
 * @query {string} search - Search by conversation title
 * @query {string} sortBy - Sort field (title, createdAt, updatedAt)
 * @query {string} sortDirection - Sort direction (asc, desc)
 */
router.get('/conversations', listAllConversationsController);

/**
 * @route GET /api/admin/conversations/:conversationId/messages
 * @desc Get all messages for a specific conversation
 * @access Admin only
 */
router.get('/conversations/:conversationId/messages', getConversationMessagesController);

/**
 * @route GET /api/admin/groups
 * @desc List all groups
 * @access Admin only
 */
router.get('/groups', listGroupsController);

/**
 * @route POST /api/admin/groups
 * @desc Create a new group
 * @access Admin only
 */
router.post('/groups', createGroupController);

/**
 * @route DELETE /api/admin/groups/:groupName
 * @desc Delete a group
 * @access Admin only
 */
router.delete('/groups/:groupName', deleteGroupController);

/**
 * @route GET /api/admin/groups/:groupName/users
 * @desc Get users by group
 * @access Admin only
 */
router.get('/groups/:groupName/users', getUsersByGroupController);

module.exports = router;
