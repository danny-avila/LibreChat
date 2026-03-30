#!/usr/bin/env node
/**
 * Test script to add some users to groups for testing statistics
 */

const mongoose = require('mongoose');

async function addTestUsersToGroups() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/LibreChat';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const { User, Group } = require('./api/db/models');
    const { addUserToGroup } = require('./api/models/Group');

    // Get some users and groups
    const users = await User.find({}).limit(10).lean();
    const groups = await Group.find({}).limit(3).lean();

    if (users.length === 0) {
      console.log('No users found in database');
      process.exit(1);
    }

    if (groups.length === 0) {
      console.log('No groups found in database');
      process.exit(1);
    }

    console.log(`Found ${users.length} users and ${groups.length} groups`);

    // Add users to groups
    let added = 0;
    for (let i = 0; i < Math.min(users.length, 5); i++) {
      const user = users[i];
      const group = groups[i % groups.length];
      
      try {
        await addUserToGroup(group._id.toString(), user._id.toString(), user._id.toString());
        console.log(`Added user ${user.email || user.username} to group ${group.name}`);
        added++;
      } catch (error) {
        if (error.message.includes('already a member')) {
          console.log(`User ${user.email || user.username} is already in group ${group.name}`);
        } else {
          console.error(`Failed to add user ${user.email}: ${error.message}`);
        }
      }
    }

    console.log(`Successfully added ${added} users to groups`);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the script
addTestUsersToGroups();