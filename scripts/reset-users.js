const { MongoClient } = require('mongodb');

async function resetUsers() {
  try {
    console.log('Connecting to MongoDB...');
    const client = await MongoClient.connect('mongodb://localhost:27017');
    const db = client.db('LibreChat');
    
    console.log('Dropping users collection...');
    await db.collection('users').drop().catch(err => {
      if (err.message.includes('ns not found')) {
        console.log('Users collection does not exist. Creating new one.');
        return;
      }
      throw err;
    });
    
    console.log('Creating new users collection...');
    await db.createCollection('users');
    
    console.log('✅ Users collection reset successfully');
    await client.close();
  } catch (error) {
    console.error('❌ Error resetting users:', error.message);
    process.exit(1);
  }
}

resetUsers().catch(console.error);
