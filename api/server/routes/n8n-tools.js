const express = require('express');
const jwt = require('jsonwebtoken');
const { logger } = require('@librechat/data-schemas');
const n8nToolService = require('../services/N8nToolService');
// Kita hapus n8nToolExecutor agar tidak bingung, kita pakai Service langsung
const profileAuth = require('../middleware/profileAuth');
const Profile = require('../models/Profile');

const router = express.Router();

/**
 * ==========================================
 * POST /api/n8n-tools/setup-profile
 * Initialize user profile
 * ==========================================
 */
router.post('/setup-profile', async (req, res) => {
  try {
    // 1. Manual Auth Check
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_SECRET || process.env.CREDS_JWT_SECRET || 'secret';

    let decoded;
    try {
      decoded = jwt.verify(token, secret);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const userId = decoded.userId || decoded.id;
    const { role } = req.body;

    if (!['ceo', 'employee', 'customer'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Use: ceo, employee, or customer' });
    }

    // 2. Get Workflows Dynamic from Service (INI YANG BENAR)
    // Kita tidak menulis array manual di sini lagi. Kita minta Service menyediakannya.
    const workflows = n8nToolService.getWorkflowsForRole(role);

    // 3. Save to MongoDB
    const profile = await Profile.findOneAndUpdate(
      { userId: userId },
      {
        userId: userId,
        profileType: role,
        permissions: ['read', 'write'],
        allowedWorkflows: workflows, // Data dari service masuk ke sini
        metadata: {
          department: role === 'ceo' ? 'Executive' : 'Operations',
          companyId: 'JAMOT-HQ',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    // Clear cache agar profile baru terbaca
    n8nToolService.clearCache();

    logger.info(
      `[Setup] Profile created for user ${userId} as ${role} with ${workflows.length} workflows`,
    );

    res.json({
      success: true,
      message: `Profile initialized successfully as ${role.toUpperCase()}`,
      profile,
    });
  } catch (error) {
    logger.error('[Setup] Error creating profile:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * ==========================================
 * GET /api/n8n-tools
 * Get available tools
 * ==========================================
 */
router.get('/', profileAuth, async (req, res) => {
  try {
    // Gunakan service langsung untuk memastikan format sesuai definisi terbaru
    const tools = await n8nToolService.getToolsForProfile(req.profile.profileType);

    res.json({
      success: true,
      userId: req.user._id,
      profileType: req.profile?.profileType,
      toolCount: tools.length,
      tools: tools.map((tool) => ({
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
        metadata: tool._metadata,
      })),
    });
  } catch (error) {
    logger.error('[N8nToolsRoutes] Error getting tools:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * ==========================================
 * POST /api/n8n-tools/execute
 * Execute Tool
 * ==========================================
 */
router.post('/execute', profileAuth, async (req, res) => {
  try {
    const { functionName, parameters } = req.body;

    if (!functionName)
      return res.status(400).json({ success: false, error: 'functionName is required' });

    // Verify Authorization
    if (!n8nToolService.isAuthorized(req.profile.profileType, functionName)) {
      return res
        .status(403)
        .json({ success: false, error: `Not authorized to execute ${functionName}` });
    }

    // Prepare Context
    const context = {
      profileType: req.profile.profileType,
      userId: req.user._id.toString(),
      username: req.user.username || req.user.email,
    };

    // Execute
    const result = await n8nToolService.executeWorkflow(functionName, parameters || {}, context);
    res.json(result);
  } catch (error) {
    logger.error('[N8nToolsRoutes] Error executing tool:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * ==========================================
 * GET /api/n8n-tools/workflows
 * Admin Only
 * ==========================================
 */
router.get('/workflows', profileAuth, async (req, res) => {
  try {
    if (!['admin', 'ceo'].includes(req.profile?.profileType)) {
      return res.status(403).json({ success: false, error: 'Admin or CEO access required' });
    }
    const workflows = n8nToolService.getAllWorkflows();
    res.json({
      success: true,
      workflows: Object.entries(workflows).map(([id, def]) => ({
        workflowId: id,
        functionName: def.name,
        description: def.description,
        endpoint: def.endpoint,
        profileTypes: def.profileTypes,
        parameters: def.parameters, // Tambahkan ini agar lengkap
      })),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/n8n-tools/clear-cache
 */
router.post('/clear-cache', profileAuth, async (req, res) => {
  try {
    if (req.profile?.profileType !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    n8nToolService.clearCache();
    res.json({ success: true, message: 'Cache cleared' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/n8n-tools/test
 */
router.get('/test', profileAuth, async (req, res) => {
  try {
    const profile = req.profile;
    // Pakai Service langsung untuk test
    const tools = await n8nToolService.getToolsForProfile(profile.profileType);

    res.json({
      success: true,
      message: 'N8n tools system is working',
      user: { id: req.user._id, email: req.user.email },
      profile: {
        profileType: profile.profileType,
        workflowCount: profile.allowedWorkflows?.length || 0,
      },
      tools: {
        count: tools.length,
        names: tools.map((t) => t.function.name),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
