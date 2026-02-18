const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const n8nToolService = require('../api/server/services/N8nToolService');
const Profile = require('../api/server/models/Profile');

// Inline User schema (same shape as in seed/test scripts)
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  name: { type: String },
  username: { type: String },
  avatar: { type: String },
  role: { type: String, default: 'user', enum: ['user', 'admin'] },
  provider: { type: String, required: true, default: 'local' },
  emailVerified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

const MONGO_URI = process.env.MONGO_URI;

// Default permissions for CEO profile (used only if we don't find a template CEO profile)
const CEO_PERMISSIONS = ['full_analytics', 'financial_data', 'all_departments', 'strategic_planning'];

// === EDIT THESE IF YOU EVER NEED A DIFFERENT CEO TEST USER ===
const CE0_USER = {
  email: 'justiniyke29@gmail.com',
  password: 'Test1234@',
  name: 'CEO Justin',
  profileType: 'ceo',
};

async function createCeoUser() {
  try {
    console.log('🌱 Creating CEO user...\n');

    if (!MONGO_URI) {
      throw new Error('MONGO_URI is not defined in .env file');
    }

    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const userData = CE0_USER;

    console.log(`📝 Processing user: ${userData.email}`);

    // Check if user exists
    let user = await User.findOne({ email: userData.email });

    if (user) {
      console.log('   ⚠️  User already exists, will ensure profile is CEO.');
    } else {
      const hashedPassword = await bcrypt.hash(userData.password, 10);

      user = await User.create({
        email: userData.email,
        password: hashedPassword,
        name: userData.name,
        username: userData.email.split('@')[0],
        provider: 'local',
        role: 'user',
      });

      console.log('   ✅ User created');
    }

    // Compute allowed workflows for CEO profile (n8n-based tools)
    let correctWorkflows = n8nToolService.getWorkflowsForRole('ceo');

    // Try to clone permissions + workflows from an existing CEO profile (e.g. Andrea)
    // so this new CEO has the full 18-permission set used in production.
    let permissions = CEO_PERMISSIONS;
    const templateProfile = await Profile.findOne({
      profileType: 'ceo',
      userId: { $ne: user._id },
    });

    if (templateProfile) {
      console.log('   📋 Found existing CEO profile; cloning permissions & workflows...');
      permissions = templateProfile.permissions;
      // Clone the workflows so we don't accidentally hold mongoose document refs
      correctWorkflows = templateProfile.allowedWorkflows.map((w) => ({
        workflowId: w.workflowId,
        workflowName: w.workflowName,
        endpoint: w.endpoint,
        description: w.description,
      }));
    } else {
      console.log('   ⚠️ No existing CEO profile found; using default CEO permissions & workflows.');
    }

    // Check if profile exists
    let profile = await Profile.findOne({ userId: user._id });

    if (profile) {
      console.log('   🔄 Updating existing profile to CEO...');
      profile.profileType = 'ceo';
      profile.permissions = permissions;
      profile.allowedWorkflows = correctWorkflows;
      profile.updatedAt = new Date();
      await profile.save();
      console.log(`   ✅ Profile updated with ${correctWorkflows.length} workflows`);
    } else {
      console.log('   ➕ Creating new CEO profile...');
      profile = await Profile.create({
        userId: user._id,
        profileType: 'ceo',
        permissions,
        allowedWorkflows: correctWorkflows,
        metadata: {
          securityLevel: 5,
          companyId: 'COMPANY_001',
        },
      });
      console.log(`   ✅ Profile created with ${correctWorkflows.length} workflows`);
    }

    console.log('\n'.padEnd(60, '='));
    console.log('🎉 CEO USER READY');
    console.log(`📧 Email   : ${userData.email}`);
    console.log(`🔐 Password: ${userData.password}`);
    console.log(''.padEnd(60, '='));
  } catch (error) {
    console.error('❌ Error creating CEO user:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

createCeoUser();

