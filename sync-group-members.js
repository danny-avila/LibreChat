#!/usr/bin/env node
/**
 * Script to synchronize group members from user.groupMemberships to group.members array
 */

const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');

async function syncGroupMembers() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/LibreChat';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const { User, Group } = require('./api/db/models');

    // Get all groups
    const groups = await Group.find({}).lean();
    console.log(`Found ${groups.length} groups to sync`);

    for (const group of groups) {
      // Find all users with membership in this group
      const usersInGroup = await User.find({
        'groupMemberships.groupId': group._id
      }).select('_id').lean();

      const memberIds = usersInGroup.map(u => u._id);
      
      // Update group with correct members array and count
      await Group.findByIdAndUpdate(
        group._id,
        {
          members: memberIds,
          memberCount: memberIds.length
        }
      );

      console.log(`Updated group "${group.name}": ${memberIds.length} members`);
    }

    console.log('Synchronization complete!');
    process.exit(0);
  } catch (error) {
    console.error('Error during synchronization:', error);
    process.exit(1);
  }
}

// Run the sync
syncGroupMembers();