console.log('🚀 Starting test...');

const apiKey = process.env.MONDAY_API_KEY;
console.log('API Key exists:', !!apiKey);
console.log('API Key length:', apiKey ? apiKey.length : 0);

if (!apiKey) {
  console.log('❌ No API key');
  process.exit(1);
}

console.log('✅ Test setup complete');
