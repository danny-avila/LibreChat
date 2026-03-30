const mongoose = require('mongoose');
const { createModels } = require('./packages/data-schemas/dist/index.cjs');
const { User } = createModels(mongoose);

const MONGO_URI = 'mongodb://127.0.0.1:27017/LibreChat';

async function makeUserAdmin() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    // List all users first
    const users = await User.find({}, 'email role name provider');
    console.log('\nCurrent users:');
    users.forEach(user => {
      console.log(`- ${user.email} (${user.name}) - Role: ${user.role || 'user'} - Provider: ${user.provider || 'local'}`);
    });

    // If no users exist, inform user to create one through the UI first
    if (users.length === 0) {
      console.log('\nNo users found! Please:');
      console.log('1. Go to http://localhost:3093/register');
      console.log('2. Create a user account');
      console.log('3. Run this script again');
      return;
    }

    // Find user with provider 'entra' or ask which user to make admin
    const entraUser = users.find(user => user.provider === 'entra' || user.email.includes('ondra') || user.email.includes('pajgrt'));
    
    if (entraUser) {
      console.log(`\nMaking Entra user ${entraUser.email} an admin...`);
      await User.findByIdAndUpdate(entraUser._id, { 
        role: 'ADMIN' 
      });
      console.log(`✅ ${entraUser.email} is now an admin!`);
    } else {
      // Make all users admin for now to be safe
      console.log('\nMaking all users admin...');
      for (const user of users) {
        await User.findByIdAndUpdate(user._id, { 
          role: 'ADMIN' 
        });
        console.log(`✅ ${user.email} is now an admin!`);
      }
    }
    console.log('\nYou can now access Group Management at: http://localhost:3093/d/groups');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

makeUserAdmin();