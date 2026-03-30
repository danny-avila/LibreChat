import { FullConfig } from '@playwright/test';

/**
 * Global setup for Statistics feature testing
 * 
 * This setup ensures the testing environment is properly configured
 * for testing authentication and authorization in the Statistics feature.
 */
async function globalSetup(config: FullConfig) {
  console.log('🧪 Setting up Statistics Feature Tests');
  console.log('=====================================');
  
  // Check environment variables
  const requiredEnvVars = [
    'TEST_EMAIL',
    'TEST_PASSWORD',
  ];
  
  const optionalEnvVars = [
    'TEST_ADMIN_EMAIL',
    'TEST_ADMIN_PASSWORD',
  ];
  
  const missingRequired = requiredEnvVars.filter(envVar => !process.env[envVar]);
  const missingOptional = optionalEnvVars.filter(envVar => !process.env[envVar]);
  
  if (missingRequired.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingRequired.forEach(envVar => {
      console.error(`   - ${envVar}`);
    });
    console.error('\nPlease set these environment variables before running tests.');
    console.error('Example:');
    console.error('export TEST_EMAIL="user@test.com"');
    console.error('export TEST_PASSWORD="password"');
    throw new Error('Missing required environment variables');
  }
  
  if (missingOptional.length > 0) {
    console.warn('⚠️  Missing optional environment variables (admin tests may be skipped):');
    missingOptional.forEach(envVar => {
      console.warn(`   - ${envVar}`);
    });
    console.warn('\nTo run admin tests, set:');
    console.warn('export TEST_ADMIN_EMAIL="admin@test.com"');
    console.warn('export TEST_ADMIN_PASSWORD="admin_password"');
  }
  
  // Display current configuration
  console.log('\n📋 Test Configuration:');
  console.log(`   Base URL: ${config.webServer?.port ? `http://localhost:${config.webServer.port}` : 'Not specified'}`);
  console.log(`   Regular User: ${process.env.TEST_EMAIL}`);
  console.log(`   Admin User: ${process.env.TEST_ADMIN_EMAIL || 'Not set (admin tests may be skipped)'}`);
  console.log(`   Workers: ${config.workers}`);
  console.log(`   Retries: ${config.retries}`);
  
  // Test instructions
  console.log('\n📚 Before running these tests, ensure:');
  console.log('   1. Backend server is running (npm run backend:dev)');
  console.log('   2. Database is accessible and has test users');
  console.log('   3. Regular user exists with TEST_EMAIL credentials');
  console.log('   4. Admin user exists with TEST_ADMIN_EMAIL credentials and ADMIN role');
  console.log('   5. Statistics API endpoints are properly configured');
  
  // Admin user setup instructions
  if (process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD) {
    console.log('\n🔧 To create/verify admin user:');
    console.log('   npm run create-user');
    console.log('   # Then set role to ADMIN in database:');
    console.log(`   db.users.updateOne({email: "${process.env.TEST_ADMIN_EMAIL}"}, {$set: {role: "ADMIN"}})`);
  }
  
  console.log('\n🚀 Starting Statistics Feature Tests...\n');
  
  // Verify we can connect to the base URL
  try {
    const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${config.webServer?.port || 3080}`;
    const response = await fetch(`${baseURL}/login`);
    if (!response.ok) {
      throw new Error(`Server not responding: ${response.status}`);
    }
    console.log('✅ Server is accessible');
  } catch (error) {
    console.error('❌ Cannot connect to server:', error);
    throw new Error('Server not accessible');
  }
}

export default globalSetup;