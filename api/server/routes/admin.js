const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User } = require('@librechat/data-schemas').createModels(mongoose);
const { requireJwtAuth } = require('../middleware');
const requireCEORole = require('../middleware/requireCEORole');
const Profile = require('../models/Profile');

const router = express.Router();

// Log all incoming requests to admin routes
router.use((req, res, next) => {
  console.log(`[Admin Route] ${req.method} ${req.path}`);
  console.log('[Admin Route] Headers:', req.headers);
  console.log('[Admin Route] Cookies:', req.headers.cookie);
  next();
});

/**
 * POST /api/admin/users/create
 * Create a new employee or CEO user account
 */
router.post('/users/create', async (req, res) => {
  try {
    const { email, name, password, profileType, permissions, department } = req.body;

    // Validate profile type
    if (!['employee', 'ceo'].includes(profileType)) {
      return res.status(400).json({
        error: 'Invalid profile type',
        message: 'Only employee or ceo profiles can be created',
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email }).lean();
    if (existingUser) {
      return res.status(409).json({
        error: 'User exists',
        message: 'A user with this email already exists',
      });
    }

    // Hash password
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);

    // Create user
    const newUser = await User.create({
      provider: 'local',
      email,
      password: hashedPassword,
      username: email,
      name,
      avatar: null,
      role: 'USER',
    });

    // Determine workflows based on profile type
    let allowedWorkflows = [];
    let defaultPermissions = [];

    if (profileType === 'ceo') {
      // CEO gets analytics workflows only (matches n8n documentation)
      allowedWorkflows = [
        { workflowId: 'wf_financial_analytics', workflowName: 'Financial Analytics', endpoint: '/webhook/librechat/financial-analytics', description: 'View revenue, expenses, and profit margins' },
        { workflowId: 'wf_company_metrics', workflowName: 'Company Metrics', endpoint: '/webhook/librechat/company-metrics', description: 'Employee count, active projects, satisfaction scores' }
      ];
      defaultPermissions = [
        'create_project', 'view_all_projects', 'update_project', 'delete_project',
        'create_task', 'view_all_tasks', 'update_task', 'delete_task', 'assign_task',
        'create_ticket', 'view_all_tickets', 'update_ticket', 'delete_ticket',
        'create_workflow_result', 'view_all_workflow_results', 'update_workflow_result', 'delete_workflow_result',
        'manage_users',
      ];
    } else if (profileType === 'employee') {
      // Employee gets task and project workflows
      allowedWorkflows = [
        { workflowId: 'wf_create_task', workflowName: 'Create Task', endpoint: '/api/workflows/create-task', description: 'Create new tasks' },
        { workflowId: 'wf_list_task', workflowName: 'List Tasks', endpoint: '/api/workflows/list-task', description: 'View assigned tasks' },
        { workflowId: 'wf_update_task', workflowName: 'Update Task', endpoint: '/api/workflows/update-task', description: 'Update task details' },
        { workflowId: 'wf_list_project', workflowName: 'List Projects', endpoint: '/api/workflows/list-project', description: 'View projects' },
        { workflowId: 'wf_create_workflow_result', workflowName: 'Create Workflow Result', endpoint: '/api/workflows/create-workflow-result', description: 'Log workflow execution results' },
        { workflowId: 'wf_list_workflow_result', workflowName: 'List Workflow Results', endpoint: '/api/workflows/list-workflow-result', description: 'View workflow results' },
      ];
      defaultPermissions = [
        'create_task', 'view_assigned_tasks', 'update_own_task',
        'view_all_projects',
        'create_workflow_result', 'view_own_workflow_results',
      ];
    }

    // Use custom permissions if provided, otherwise use defaults
    const finalPermissions = permissions && permissions.length > 0 ? permissions : defaultPermissions;

    // Create profile
    const profile = await Profile.create({
      userId: newUser._id,
      profileType,
      permissions: finalPermissions,
      allowedWorkflows,
      metadata: {
        department: department || null,
        securityLevel: profileType === 'ceo' ? 3 : 2,
      },
    });

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: newUser._id,
        email: newUser.email,
        name: newUser.name,
        profileType: profile.profileType,
        permissions: profile.permissions,
        department: profile.metadata?.department,
      },
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({
      error: 'Server error',
      message: 'Failed to create user',
    });
  }
});

/**
 * GET /api/admin/users
 * List all users with their profiles
 */
router.get('/users', async (req, res) => {
  try {
    const { profileType, limit = 50, offset = 0 } = req.query;

    // Build query
    const query = {};
    if (profileType && ['ceo', 'employee', 'customer'].includes(profileType)) {
      query.profileType = profileType;
    }

    // Get profiles with user data
    const profiles = await Profile.find(query)
      .populate('userId', 'email name avatar createdAt')
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .sort({ createdAt: -1 })
      .lean();

    // Get total count
    const total = await Profile.countDocuments(query);

    // Format response
    const users = profiles.map((profile) => ({
      id: profile.userId._id,
      email: profile.userId.email,
      name: profile.userId.name,
      avatar: profile.userId.avatar,
      profileType: profile.profileType,
      permissions: profile.permissions,
      department: profile.metadata?.department,
      allowedWorkflows: profile.allowedWorkflows,
      createdAt: profile.userId.createdAt,
    }));

    res.json({
      users,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      error: 'Server error',
      message: 'Failed to fetch users',
    });
  }
});

/**
 * PATCH /api/admin/users/:id/profile
 * Update a user's profile type and permissions
 */
router.patch('/users/:id/profile', requireJwtAuth, requireCEORole, async (req, res) => {
  try {
    const { id } = req.params;
    const { profileType, permissions, department } = req.body;

    // Find user and profile
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'No user found with this ID',
      });
    }

    const profile = await Profile.findOne({ userId: id });
    if (!profile) {
      return res.status(404).json({
        error: 'Profile not found',
        message: 'User does not have a profile',
      });
    }

    // Validate profile type if provided
    if (profileType && !['ceo', 'employee', 'customer'].includes(profileType)) {
      return res.status(400).json({
        error: 'Invalid profile type',
        message: 'Profile type must be ceo, employee, or customer',
      });
    }

    // Update profile
    if (profileType) {
      profile.profileType = profileType;
    }
    if (permissions) {
      profile.permissions = permissions;
    }
    if (department !== undefined) {
      profile.metadata = profile.metadata || {};
      profile.metadata.department = department;
    }

    await profile.save();

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        profileType: profile.profileType,
        permissions: profile.permissions,
        department: profile.metadata?.department,
      },
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({
      error: 'Server error',
      message: 'Failed to update profile',
    });
  }
});

/**
 * DELETE /api/admin/users/:id
 * Deactivate a user (soft delete)
 */
router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Find user
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'No user found with this ID',
      });
    }

    // Soft delete by setting role to DELETED or removing access
    user.role = 'DELETED';
    await user.save();

    // Also delete the profile
    await Profile.findOneAndDelete({ userId: id });

    res.json({
      message: 'User deactivated successfully',
      userId: id,
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      error: 'Server error',
      message: 'Failed to delete user',
    });
  }
});

module.exports = router;
