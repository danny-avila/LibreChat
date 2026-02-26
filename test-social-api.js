// Quick test script to verify social API endpoints
const http = require('http');

function testEndpoint(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3090,
      path: path,
      method: 'GET',
      headers: {
        'Cookie': 'connect.sid=test'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`\n${path}:`);
        console.log(`Status: ${res.statusCode}`);
        console.log(`Response: ${data.substring(0, 200)}${data.length > 200 ? '...' : ''}`);
        resolve({ status: res.statusCode, data });
      });
    });

    req.on('error', (error) => {
      console.error(`Error testing ${path}:`, error.message);
      reject(error);
    });

    req.end();
  });
}

async function runTests() {
  console.log('Testing Social API Endpoints...\n');
  console.log('='.repeat(50));
  
  try {
    await testEndpoint('/api/social/platforms');
    await testEndpoint('/api/social/accounts');
    await testEndpoint('/api/social/status');
  } catch (error) {
    console.error('Test failed:', error);
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('Tests complete!');
}

runTests();
