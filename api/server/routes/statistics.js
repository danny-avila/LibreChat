const express = require('express');
const { requireJwtAuth } = require('../middleware');
const { checkAdmin } = require('../middleware/roles');
const {
  getUserLeaderboard,
  getUserStatistics
} = require('../controllers/UserStatisticsController');
const {
  getGroupLeaderboard,
  getGroupStatistics,
  getGroupMemberStatistics
} = require('../controllers/GroupStatisticsController');

const router = express.Router();

// Apply authentication and admin check to all routes
router.use(requireJwtAuth);
router.use(checkAdmin);

// User statistics routes
router.get('/users/leaderboard', getUserLeaderboard);
router.get('/users/:userId', getUserStatistics);

// Group statistics routes
router.get('/groups/leaderboard', getGroupLeaderboard);
router.get('/groups/:groupId', getGroupStatistics);
router.get('/groups/:groupId/members', getGroupMemberStatistics);

module.exports = router;