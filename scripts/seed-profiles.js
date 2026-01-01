const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const n8nToolService = require('../api/server/services/N8nToolService');
const Profile = require('../api/server/models/Profile');

// Define User schema directly (inline approach biar ga ribet import)
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

// Create User model
const User = mongoose.models.User || mongoose.model('User', userSchema);

// MongoDB connection
const MONGO_URI = process.env.MONGO_URI;

// PERMISSION SETS
const PERMISSION_SETS = {
  ceo: ['full_analytics', 'financial_data', 'all_departments', 'strategic_planning'],
  employee: ['department_data', 'personal_records', 'team_collaboration', 'knowledge_base'],
  customer: ['own_projects', 'support_history', 'billing_info', 'public_docs'],
};

// Test users
const TEST_USERS = [
  {
    email: 'ceo@librechat.test',
    password: 'ceo12345',
    name: 'CEO User',
    profileType: 'ceo',
  },
  {
    email: 'employee@librechat.test',
    password: 'emp12345',
    name: 'Employee User',
    profileType: 'employee',
  },
  {
    email: 'customer@librechat.test',
    password: 'cust12345',
    name: 'Customer User',
    profileType: 'customer',
  },
];

async function seedDatabase() {
  try {
    console.log('🌱 Starting database seeding...\n');

    if (!MONGO_URI) {
      throw new Error('MONGO_URI is not defined in .env file');
    }

    // Connect to MongoDB
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Process each test user
    for (const userData of TEST_USERS) {
      console.log(`📝 Processing user: ${userData.email}`);

      // Check if user exists
      let user = await User.findOne({ email: userData.email });

      if (user) {
        console.log(`   ⚠️  User already exists, checking profile...`);
      } else {
        // Hash password
        const hashedPassword = await bcrypt.hash(userData.password, 10);

        // Create user
        user = await User.create({
          email: userData.email,
          password: hashedPassword,
          name: userData.name,
          username: userData.email.split('@')[0],
          provider: 'local',
          role: 'user',
        });

        console.log(`   ✅ User created`);
      }

      const correctWorkflows = n8nToolService.getWorkflowsForRole(userData.profileType);

      // Check if profile exists
      let profile = await Profile.findOne({ userId: user._id });

      if (profile) {
        console.log(`   🔄 Updating existing profile...`);

        profile.profileType = userData.profileType;
        profile.permissions = PERMISSION_SETS[userData.profileType];
        profile.allowedWorkflows = correctWorkflows; // Sync workflow terbaru
        profile.updatedAt = new Date();

        await profile.save();
        console.log(`   ✅ Profile updated with ${correctWorkflows.length} workflows`);
      } else {
        // Create new profile
        let securityLevel = 1;
        if (userData.profileType === 'ceo') securityLevel = 5;
        else if (userData.profileType === 'employee') securityLevel = 3;

        profile = await Profile.create({
          userId: user._id,
          profileType: userData.profileType,
          permissions: PERMISSION_SETS[userData.profileType],
          allowedWorkflows: correctWorkflows,
          metadata: {
            department: userData.profileType === 'employee' ? 'Engineering' : null,
            customerId: userData.profileType === 'customer' ? `CUST_${Date.now()}` : null,
            securityLevel: securityLevel,
            companyId: 'COMPANY_001',
          },
        });

        console.log(`   ✅ Profile created with ${correctWorkflows.length} workflows`);
      }
      console.log('');
    }

    console.log('='.repeat(60));
    console.log('🎉 DATABASE SEEDING COMPLETED!\n');
    console.log('📋 Login Credentials:');
    TEST_USERS.forEach((u) => console.log(`   - ${u.email} / ${u.password}`));
    console.log('='.repeat(60));
  } catch (error) {
    console.error('❌ Seeding error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run seeding
seedDatabase();
