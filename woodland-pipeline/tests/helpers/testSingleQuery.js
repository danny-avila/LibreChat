#!/usr/bin/env node
/**
 * Manual Test - Single Agent Query
 * Use this to debug the LibreChat API interaction
 */

const axios = require('axios');

const LIBRECHAT_URL = process.env.LIBRECHAT_URL || 'http://localhost:3080';
const AUTH_TOKEN = process.env.WOODLAND_TEST_TOKEN;

async function testQuery() {
  console.log('🧪 Testing LibreChat API\n');
  console.log(`URL: ${LIBRECHAT_URL}/api/ask`);
  console.log(`Token: ${AUTH_TOKEN ? AUTH_TOKEN.substring(0, 20) + '...' : 'NOT SET'}\n`);

  if (!AUTH_TOKEN) {
    console.error('❌ WOODLAND_TEST_TOKEN not set');
    process.exit(1);
  }

  const requestBody = {
    text: "What is the warranty period for Woodland solar panels?",
    conversationId: null,
    parentMessageId: '00000000-0000-0000-0000-000000000000',
    model: 'gpt-4o',
    endpoint: 'azureOpenAI',
  };

  console.log('📤 Request:');
  console.log(JSON.stringify(requestBody, null, 2));
  console.log('');

  try {
    const response = await axios.post(
      `${LIBRECHAT_URL}/api/ask`,
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
        responseType: 'text',
      }
    );

    console.log('📥 Response Status:', response.status);
    console.log('📥 Response Headers:');
    console.log(JSON.stringify(response.headers, null, 2));
    console.log('');
    console.log('📥 Response Data (first 1000 chars):');
    const data = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    console.log(data.substring(0, 1000));
    console.log('');
    console.log('📥 Response Data Type:', typeof response.data);
    console.log('📥 Response Data Length:', response.data?.length);
    
    // Try to parse as JSON
    if (typeof response.data === 'string') {
      try {
        const json = JSON.parse(response.data);
        console.log('\n✅ Parsed as JSON:');
        console.log(JSON.stringify(json, null, 2).substring(0, 500));
      } catch (e) {
        console.log('\n⚠️  Not valid JSON, checking for SSE format...');
        const lines = response.data.split('\n').filter(l => l.trim());
        console.log(`Found ${lines.length} lines`);
        console.log('First 5 lines:');
        lines.slice(0, 5).forEach((line, i) => {
          console.log(`  ${i + 1}: ${line.substring(0, 100)}`);
        });
      }
    }

  } catch (error) {
    console.error('\n❌ Request failed:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Headers:', error.response.headers);
      console.error('Data:', typeof error.response.data === 'string' 
        ? error.response.data.substring(0, 500)
        : JSON.stringify(error.response.data).substring(0, 500));
    }
  }
}

testQuery().catch(console.error);
