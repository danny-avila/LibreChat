#!/usr/bin/env node
/**
 * Seed Initial CEO Account
 * Creates the first CEO user for system setup
 * Usage: npm run seed-ceo
 */

require('dotenv').config();
const path = require('path');
const mongoose = require('mongoose');
const { User } = require('@librechat/data-schemas').createModels(mongoose);
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const Profile = require('../api/server/models/Profile');
const { askQuestion, silentExit } = require('./helpers');
const connect = require('./connect');

async function seedCEO() {
  try {
    console.log('\n🌱 CEO Account Seeding Tool');
    console.log('═'.repeat(50));
    
    await connect();
    console.log('✅ Connected to database\n');

    // Check if CEO already exists
    const existingCEO = await Profile.findOne({ profileType: 'ceo' });
    if (existingCEO) {
      const user = await User.findById(existingCEO.userId);
      console.log('⚠️  A CEO account already exists:');
      console.log(`   Email: ${user.email}`);
      console.log(`   Name: ${user.name}`);
      console.log(`   User ID: ${user._id}\n`);
      
      const shouldContinue = await askQuestion('Do you want to create another CEO? (yes/no): ');
      if (shouldContinue.toLowerCase() !== 'yes') {
        console.log('\n❌ Cancelled. No changes made.');
        return silentExit(0);
      }
      console.log('');
    }

    // Gather user information
    console.log('Please provide the following information:\n');
    
    const email = await askQuestion('CEO Email: ');
    if (!email || !email.includes('@')) {
      console.log('\n❌ Invalid email address');
      return silentExit(1);
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log('\n⚠️  User with this email already exists.');
      const existingProfile = await Profile.findOne({ userId: existingUser._id });
      
      if (existingProfile) {
        console.log(`   Current profile type: ${existingProfile.profileType}`);
        const shouldUpgrade = await askQuestion('\nUpgrade this user to CEO? (yes/no): ');
        
        if (shouldUpgrade.toLowerCase() === 'yes') {
          // Update existing profile to CEO
          existingProfile.profileType = 'ceo';
          existingProfile.permissions = [
            'create_project', 'view_all_projects', 'update_project', 'delete_project',
            'create_task', 'view_all_tasks', 'update_task', 'delete_task', 'assign_task',
            'create_ticket', 'view_all_tickets', 'update_ticket', 'delete_ticket',
            'create_workflow_result', 'view_all_workflow_results', 'update_workflow_result', 'delete_workflow_result',
            'manage_users',
          ];
          existingProfile.allowedWorkflows = getCEOWorkflows();
          existingProfile.metadata = { securityLevel: 3 };
          await existingProfile.save();
          
          console.log('\n✅ User upgraded to CEO successfully!');
          console.log(`   Email: ${existingUser.email}`);
          console.log(`   Name: ${existingUser.name}`);
          console.log(`   User ID: ${existingUser._id}`);
          return silentExit(0);
        } else {
          console.log('\n❌ Cancelled. No changes made.');
          return silentExit(0);
        }
      } else {
        // User exists but no profile - create CEO profile
        const profile = await Profile.create({
          userId: existingUser._id,
          profileType: 'ceo',
          permissions: [
            'create_project', 'view_all_projects', 'update_project', 'delete_project',
            'create_task', 'view_all_tasks', 'update_task', 'delete_task', 'assign_task',
            'create_ticket', 'view_all_tickets', 'update_ticket', 'delete_ticket',
            'create_workflow_result', 'view_all_workflow_results', 'update_workflow_result', 'delete_workflow_result',
            'manage_users',
          ],
          allowedWorkflows: getCEOWorkflows(),
          metadata: { securityLevel: 3 },
        });
        
        console.log('\n✅ CEO profile created for existing user!');
        console.log(`   Email: ${existingUser.email}`);
        console.log(`   Name: ${existingUser.name}`);
        console.log(`   User ID: ${existingUser._id}`);
        return silentExit(0);
      }
    }

    const name = await askQuestion('CEO Full Name: ');
    if (!name || name.trim().length < 2) {
      console.log('\n❌ Name must be at least 2 characters');
      return silentExit(1);
    }

    const password = await askQuestion('CEO Password (min 8 characters): ');
    if (!password || password.length < 8) {
      console.log('\n❌ Password must be at least 8 characters');
      return silentExit(1);
    }

    const confirmPassword = await askQuestion('Confirm Password: ');
    if (password !== confirmPassword) {
      console.log('\n❌ Passwords do not match');
      return silentExit(1);
    }

    console.log('\n' + '─'.repeat(50));
    console.log('Please confirm the following details:');
    console.log('─'.repeat(50));
    console.log(`Email:    ${email}`);
    console.log(`Name:     ${name}`);
    console.log(`Role:     CEO (Full System Access)`);
    console.log('─'.repeat(50));

    const confirm = await askQuestion('\nCreate this CEO account? (yes/no): ');
    if (confirm.toLowerCase() !== 'yes') {
      console.log('\n❌ Cancelled. No changes made.');
      return silentExit(0);
    }

    // Create user
    console.log('\n⏳ Creating CEO account...');
    const newUser = await User.create({
      provider: 'local',
      email,
      password,
      username: email,
      name: name.trim(),
      avatar: null,
      role: 'USER',
    });

    // Create CEO profile
    const profile = await Profile.create({
      userId: newUser._id,
      profileType: 'ceo',
      permissions: [
        'create_project', 'view_all_projects', 'update_project', 'delete_project',
        'create_task', 'view_all_tasks', 'update_task', 'delete_task', 'assign_task',
        'create_ticket', 'view_all_tickets', 'update_ticket', 'delete_ticket',
        'create_workflow_result', 'view_all_workflow_results', 'update_workflow_result', 'delete_workflow_result',
        'manage_users',
      ],
      allowedWorkflows: getCEOWorkflows(),
      metadata: {
        securityLevel: 3,
      },
    });

    console.log('\n✅ CEO account created successfully!');
    console.log('═'.repeat(50));
    console.log(`Email:       ${newUser.email}`);
    console.log(`Name:        ${newUser.name}`);
    console.log(`User ID:     ${newUser._id}`);
    console.log(`Profile ID:  ${profile._id}`);
    console.log(`Permissions: ${profile.permissions.length} permissions`);
    console.log(`Workflows:   ${profile.allowedWorkflows.length} workflows`);
    console.log('═'.repeat(50));
    console.log('\n🎉 The CEO can now log in and manage the system!\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
    return silentExit(1);
  } finally {
    await silentExit(0);
  }
}

function getCEOWorkflows() {
  return [
    { workflowId: 'wf_create_project', workflowName: 'Create Project', endpoint: '/api/workflows/create-project', description: 'Create new projects' },
    { workflowId: 'wf_list_project', workflowName: 'List Projects', endpoint: '/api/workflows/list-project', description: 'View all projects' },
    { workflowId: 'wf_update_project', workflowName: 'Update Project', endpoint: '/api/workflows/update-project', description: 'Update project details' },
    { workflowId: 'wf_delete_project', workflowName: 'Delete Project', endpoint: '/api/workflows/delete-project', description: 'Remove projects' },
    { workflowId: 'wf_create_task', workflowName: 'Create Task', endpoint: '/api/workflows/create-task', description: 'Create new tasks' },
    { workflowId: 'wf_list_task', workflowName: 'List Tasks', endpoint: '/api/workflows/list-task', description: 'View all tasks' },
    { workflowId: 'wf_update_task', workflowName: 'Update Task', endpoint: '/api/workflows/update-task', description: 'Update task details' },
    { workflowId: 'wf_delete_task', workflowName: 'Delete Task', endpoint: '/api/workflows/delete-task', description: 'Remove tasks' },
    { workflowId: 'wf_create_ticket', workflowName: 'Create Support Ticket', endpoint: '/api/workflows/create-ticket', description: 'Create support tickets' },
    { workflowId: 'wf_list_ticket', workflowName: 'List Support Tickets', endpoint: '/api/workflows/list-ticket', description: 'View all support tickets' },
    { workflowId: 'wf_update_ticket', workflowName: 'Update Support Ticket', endpoint: '/api/workflows/update-ticket', description: 'Update ticket status and details' },
    { workflowId: 'wf_delete_ticket', workflowName: 'Delete Support Ticket', endpoint: '/api/workflows/delete-ticket', description: 'Remove support tickets' },
    { workflowId: 'wf_assign_task', workflowName: 'Assign Task', endpoint: '/api/workflows/assign-task', description: 'Assign tasks to employees' },
    { workflowId: 'wf_create_workflow_result', workflowName: 'Create Workflow Result', endpoint: '/api/workflows/create-workflow-result', description: 'Log workflow execution results' },
    { workflowId: 'wf_list_workflow_result', workflowName: 'List Workflow Results', endpoint: '/api/workflows/list-workflow-result', description: 'View all workflow results' },
    { workflowId: 'wf_update_workflow_result', workflowName: 'Update Workflow Result', endpoint: '/api/workflows/update-workflow-result', description: 'Update workflow result details' },
    { workflowId: 'wf_delete_workflow_result', workflowName: 'Delete Workflow Result', endpoint: '/api/workflows/delete-workflow-result', description: 'Remove workflow results' },
  ];
}

seedCEO();
