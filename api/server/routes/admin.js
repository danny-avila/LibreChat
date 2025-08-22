const express = require('express');
const { requireJwtAuth, checkAdmin } = require('~/server/middleware');
const {
  listUsers,
  getUser,
  getUserStats,
  updateUserRole,
  deleteUserByAdmin,
  listUserConversations,
  listUserMessages,
  getUserUsage,
} = require('~/server/controllers/AdminController');

const router = express.Router();

router.use(requireJwtAuth, checkAdmin);

router.get('/users', listUsers);
router.get('/users/:id', getUser);
router.get('/users/:id/stats', getUserStats);
router.put('/users/:id/role', updateUserRole);
router.delete('/users/:id', deleteUserByAdmin);
router.get('/users/:id/conversations', listUserConversations);
router.get('/users/:id/messages', listUserMessages);
router.get('/users/:id/usage', getUserUsage);

module.exports = router;


