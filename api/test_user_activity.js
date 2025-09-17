const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/librechat', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const models = createModels(mongoose);
const { UserActivityLog } = models;

async function testUserActivity() {
  try {
    console.log('🔍 Testing UserActivityLog database...');
    
    // Check if collection exists
    const collections = await mongoose.connection.db.listCollections().toArray();
    const hasCollection = collections.some(col => col.name === 'useractivitylogs');
    console.log('📊 UserActivityLog collection exists:', hasCollection);
    
    // Count total documents
    const totalCount = await UserActivityLog.countDocuments({});
    console.log('📈 Total UserActivityLog documents:', totalCount);
    
    if (totalCount > 0) {
      // Get recent logs
      const recentLogs = await UserActivityLog.find({})
        .sort({ timestamp: -1 })
        .limit(5)
        .lean();
      
      console.log('📋 Recent logs:');
      recentLogs.forEach((log, index) => {
        console.log(`  ${index + 1}. User: ${log.user}, Action: ${log.action}, Time: ${log.timestamp}`);
      });
    } else {
      console.log('⚠️  No user activity logs found in database');
      console.log('💡 This might be why the AdminLogs table is empty');
    }
    
    // Check if any users exist
    const userCount = await models.User.countDocuments({});
    console.log('👥 Total users in database:', userCount);
    
  } catch (error) {
    console.error('❌ Error testing UserActivityLog:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

testUserActivity();
