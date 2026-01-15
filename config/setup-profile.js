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
  console.purple('Setup User Profile');
  console.purple('--------------------------');

  if (process.argv.length >= 4) {
    console.orange('Usage: npm run setup-profile [email] [profileType]');
    console.orange('Profile Types: ceo, employee, customer');
    console.orange('Note: if you do not pass in the arguments, you will be prompted for them.');
  }

  // Parse arguments
  let email = process.argv[2];
  let profileType = process.argv[3];

  // Prompt for email if not provided
  if (!email) {
    email = await askQuestion('Email of the user: ');
  }

  // Find user by email
  const user = await User.findOne({ email }).lean();
  if (!user) {
    console.red(`User with email "${email}" not found!`);
    silentExit(1);
  }

  console.green(`Found user: ${user.name} (${user.email})`);

  // Check if profile already exists
  const existingProfile = await Profile.findOne({ userId: user._id });
  if (existingProfile) {
    console.yellow(`Profile already exists for this user:`);
    console.yellow(`  Profile Type: ${existingProfile.profileType}`);
    console.yellow(`  Permissions: ${existingProfile.permissions.join(', ')}`);
    console.yellow(`  Workflows: ${existingProfile.allowedWorkflows.length}`);
    
    const overwrite = await askQuestion('Do you want to overwrite it? (yes/no): ');
    if (overwrite.toLowerCase() !== 'yes') {
      console.orange('Operation cancelled.');
      silentExit(0);
    }
  }

  // Prompt for profile type if not provided
  if (!profileType) {
    console.cyan('\nAvailable Profile Types:');
    console.cyan('  1. ceo      - Executive access with financial analytics');
    console.cyan('  2. employee - Project and task management');
    console.cyan('  3. customer - Support ticket management');
    profileType = await askQuestion('\nEnter profile type (ceo/employee/customer): ');
  }

  profileType = profileType.toLowerCase().trim();

  if (!['ceo', 'employee', 'customer'].includes(profileType)) {
    console.red('Invalid profile type! Must be: ceo, employee, or customer');
    silentExit(1);
  }

  // Get workflows and permissions for this profile type
  const allowedWorkflows = WORKFLOW_DEFINITIONS[profileType] || [];
  const permissions = PERMISSIONS_BY_TYPE[profileType] || [];

  // Optional: Ask for department (for employee)
  let metadata = {};
  if (profileType === 'employee') {
    const department = await askQuestion('Department (optional, press Enter to skip): ');
    if (department) {
      metadata.department = department;
    }
  }

  // Optional: Ask for customer ID (for customer)
  if (profileType === 'customer') {
    const customerId = await askQuestion('Customer ID (optional, press Enter to skip): ');
    if (customerId) {
      metadata.customerId = customerId;
    }
  }

  // Create or update profile
  const profileData = {
    userId: user._id,
    profileType,
    permissions,
    allowedWorkflows,
    metadata,
    updatedAt: new Date(),
  };

  if (existingProfile) {
    await Profile.updateOne({ userId: user._id }, profileData);
    console.green('\n✅ Profile updated successfully!');
  } else {
    profileData.createdAt = new Date();
    await Profile.create(profileData);
    console.green('\n✅ Profile created successfully!');
  }

  console.cyan('\nProfile Details:');
  console.cyan(`  User: ${user.name} (${user.email})`);
  console.cyan(`  Profile Type: ${profileType}`);
  console.cyan(`  Permissions: ${permissions.join(', ')}`);
  console.cyan(`  Allowed Workflows: ${allowedWorkflows.length}`);
  
  console.cyan('\nWorkflows:');
  allowedWorkflows.forEach((wf, index) => {
    console.cyan(`  ${index + 1}. ${wf.workflowName} - ${wf.description}`);
  });

  if (Object.keys(metadata).length > 0) {
    console.cyan('\nMetadata:');
    Object.entries(metadata).forEach(([key, value]) => {
      console.cyan(`  ${key}: ${value}`);
    });
  }

  console.purple('\n--------------------------');
  console.green('Profile setup complete!');
  console.purple('--------------------------');

  silentExit(0);
})();
