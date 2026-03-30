const express = require('express');
// Enable GroupController step by step
const {
  getGroupsHandler,
  getGroupHandler,
  createGroupHandler,
  updateGroupHandler,
  deleteGroupHandler,
  getGroupStatsHandler,
  getAvailableUsersHandler,
  getGroupMembersHandler,
  addUserToGroupHandler,
  removeUserFromGroupHandler,
} = require('~/server/controllers/GroupController');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const { requireAdmin } = require('~/server/middleware/roles');
// const {
//   validateGroupCreate,
//   validateGroupUpdate,
//   validateBulkGroupAssignment,
// } = require('~/server/middleware/validate/groupValidation');

const router = express.Router();

// Apply authentication to all routes (disabled for testing)
// router.use(requireJwtAuth);

// Test endpoints first (before parameterized routes)
router.get('/test', (req, res) => {
  res.json({ success: true, message: 'Groups API is working' });
});

router.get('/test-db', async (req, res) => {
  try {
    const models = require('~/db/models');
    const availableModels = Object.keys(models);
    
    // Let's test if we can import the Group model directly
    const mongoose = require('mongoose');
    let groupModelError = null;
    let groupModel = null;
    
    try {
      const { createGroupModel } = require('@librechat/data-schemas');
      groupModel = createGroupModel(mongoose);
    } catch (err) {
      groupModelError = err.message;
    }
    
    res.json({ 
      success: true, 
      message: 'Database test',
      availableModels,
      hasGroup: 'Group' in models,
      groupModelError,
      groupModelExists: !!groupModel,
      groupModelName: groupModel?.modelName
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// Stats endpoint (before parameterized routes)
router.get('/stats', getGroupStatsHandler);

// Available users endpoint (before parameterized routes)
router.get('/users/available', getAvailableUsersHandler);

// Group CRUD operations (Admin only) - Enable step by step
router.get('/', getGroupsHandler);
router.get('/:id', getGroupHandler);
router.post('/', createGroupHandler);
router.put('/:id', updateGroupHandler);
router.delete('/:id', deleteGroupHandler);

// Group membership management (Admin only) - Enable step by step
router.get('/:id/members', getGroupMembersHandler);
router.post('/:id/members', addUserToGroupHandler);
router.delete('/:id/members/:userId', removeUserFromGroupHandler);
// router.post('/:id/members/bulk', requireAdmin, validateBulkGroupAssignment, bulkAddUsersToGroupHandler);

// Time window management endpoints
router.get('/:id/time-windows', getGroupHandler); // Time windows are included in group data
router.post('/:id/time-windows', require('~/server/controllers/TimeWindowController.js').addTimeWindowHandler);
router.put('/:id/time-windows/:windowId', require('~/server/controllers/TimeWindowController.js').updateTimeWindowHandler);
router.delete('/:id/time-windows/:windowId', require('~/server/controllers/TimeWindowController.js').removeTimeWindowHandler);

module.exports = router;