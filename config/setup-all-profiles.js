const path = require('path');
const mongoose = require('mongoose');
const { User } = require('@librechat/data-schemas').createModels(mongoose);
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const Profile = require('../api/server/models/Profile');
const { askQuestion, silentExit } = require('./helpers');
const connect = require('./connect');

/**
 * Available workflow definitions by profile type
 */
const WORKFLOW_DEFINITIONS = {
  ceo: [
    {
      workflowId: 'wf_financial_analytics',
      workflowName: 'Financial Analytics',
      endpoint: '/webhook/librechat/financial-analytics',
      description: 'Get comprehensive financial analytics including revenue, expenses, profit.',
    },
    {
      workflowId: 'wf_company_metrics',
      workflowName: 'Company Metrics',
      endpoint: '/webhook/librechat/company-metrics',
      description: 'Get company-wide KPIs, employee count, and satisfaction scores.',
    },
  ],
  employee: [
    {
      workflowId: 'wf_create_project',
      workflowName: 'Create Project',
      endpoint: '/webhook/librechat/project-create',
      description: 'Create a new project definition.',
    },
    {
      workflowId: 'wf_list_project',
      workflowName: 'List Projects',
      endpoint: '/webhook/librechat/project-status',
      description: 'List existing projects and their statuses.',
    },
    {
      workflowId: 'wf_update_project',
      workflowName: 'Update Project',
      endpoint: '/webhook/librechat/project-update',
      description: 'Update project details, status, or progress.',
    },
    {
      workflowId: 'wf_create_task',
      workflowName: 'Create Task',
      endpoint: '/webhook/librechat/task-create',
      description: 'Create a new task assignment.',
    },
    {
      workflowId: 'wf_list_task',
      workflowName: 'List Tasks',
      endpoint: '/webhook/librechat/task-list',
      description: 'List tasks with filtering options.',
    },
    {
      workflowId: 'wf_update_task',
      workflowName: 'Update Task',
      endpoint: '/webhook/librechat/task-update',
      description: 'Update task status, assignee, or details.',
    },
  ],
  customer: [
    {
      workflowId: 'wf_create_ticket',
      workflowName: 'Create Support Ticket',
      endpoint: '/webhook/librechat/ticket-create',
      description: 'Create a new support ticket.',
    },
    {
      workflowId: 'wf_list_ticket',
      workflowName: 'List Support Tickets',
      endpoint: '/webhook/librechat/ticket-list',
      description: 'List your support tickets.',
    },
    {
      workflowId: 'wf_update_ticket',
      workflowName: 'Update Support Ticket',
      endpoint: '/webhook/librechat/ticket-update',
      description: 'Update ticket status or details.',
    },
  ],
};

const PERMISSIONS_BY_TYPE = {
  ceo: [
    'view_financial_data',
    'view_company_metrics',
    'manage_all_projects',
    'manage_all_users',
    'access_analytics',
  ],
  employee: [
    'create_project',
    'view_projects',
    'update_project',
    'create_task',
    'view_tasks',
    'update_task',
  ],
  customer: ['create_ticket', 'view_own_tickets', 'update_own_ticket'],
};

(async () => {
  await connect();

  console.purple('--------------------------');
  console.purple('Setup Profiles for All Users');
  console.purple('--------------------------');

  // Get all users without profiles
  const allUsers = await User.find({}).lean();
  console.cyan(`\nTotal users found: ${allUsers.length}`);

  if (allUsers.length === 0) {
    console.yellow('No users found in the database.');
    silentExit(0);
  }

  // Check which users already have profiles
  const existingProfiles = await Profile.find({}).lean();
  const userIdsWithProfiles = new Set(existingProfiles.map((p) => p.userId.toString()));

  const usersWithoutProfiles = allUsers.filter(
    (user) => !userIdsWithProfiles.has(user._id.toString()),
  );

  console.cyan(`Users with existing profiles: ${existingProfiles.length}`);
  console.cyan(`Users without profiles: ${usersWithoutProfiles.length}`);

  if (usersWithoutProfiles.length === 0) {
    console.green('\n✅ All users already have profiles!');
    
    console.cyan('\nExisting profiles:');
    for (const profile of existingProfiles) {
      const user = allUsers.find((u) => u._id.toString() === profile.userId.toString());
      if (user) {
        console.cyan(`  - ${user.email} (${user.name}): ${profile.profileType}`);
      }
    }
    
    silentExit(0);
  }

  console.yellow('\nUsers without profiles:');
  usersWithoutProfiles.forEach((user, index) => {
    console.yellow(`  ${index + 1}. ${user.email} (${user.name})`);
  });

  console.cyan('\nDefault Profile Assignment Strategy:');
  console.cyan('  - First user -> CEO');
  console.cyan('  - Other users -> Employee');
  console.cyan('  - You can change this after creation using: npm run setup-profile');

  const proceed = await askQuestion('\nProceed with creating default profiles? (yes/no): ');
  
  if (proceed.toLowerCase() !== 'yes') {
    console.orange('Operation cancelled.');
    silentExit(0);
  }

  console.cyan('\n📝 Creating profiles...\n');

  let created = 0;
  let errors = 0;

  for (let i = 0; i < usersWithoutProfiles.length; i++) {
    const user = usersWithoutProfiles[i];
    
    // First user gets CEO, rest get employee
    const profileType = i === 0 ? 'ceo' : 'employee';
    const allowedWorkflows = WORKFLOW_DEFINITIONS[profileType] || [];
    const permissions = PERMISSIONS_BY_TYPE[profileType] || [];

    try {
      await Profile.create({
        userId: user._id,
        profileType,
        permissions,
        allowedWorkflows,
        metadata: {
          securityLevel: profileType === 'ceo' ? 5 : 1,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      console.green(`✅ ${user.email} -> ${profileType}`);
      created++;
    } catch (error) {
      console.red(`❌ Failed to create profile for ${user.email}: ${error.message}`);
      errors++;
    }
  }

  console.purple('\n--------------------------');
  console.green(`Profile creation complete!`);
  console.cyan(`  Created: ${created}`);
  if (errors > 0) {
    console.red(`  Errors: ${errors}`);
  }
  console.purple('--------------------------');

  console.cyan('\nNext steps:');
  console.cyan('  1. To change a user\'s profile type: npm run setup-profile [email] [type]');
  console.cyan('  2. Test by logging in and clicking Dashboard in the user menu');
  console.cyan('  3. Each profile type has different workflows and permissions');

  silentExit(0);
})();
