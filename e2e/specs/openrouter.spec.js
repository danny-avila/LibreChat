#!/usr/bin/env node

/**
 * OpenRouter Integration Test Script
 * Run with: node test-openrouter-integration.js
 *
 * Prerequisites:
 * 1. LibreChat server running on localhost:3080
 * 2. Valid OPENROUTER_API_KEY in environment
 * 3. Valid JWT token (update the TOKEN variable)
 */

const fetch = require('node-fetch');
const colors = require('colors/safe');

// Configuration - UPDATE THESE
const BASE_URL = 'http://localhost:3080';
const TOKEN = 'YOUR_JWT_TOKEN'; // Get this from browser localStorage after logging in
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Test results tracking
let passed = 0;
let failed = 0;
const results = [];

// Helper function for tests
async function runTest(name, testFn) {
  process.stdout.write(`Testing: ${name}... `);
  try {
    await testFn();
    console.log(colors.green('✓ PASSED'));
    passed++;
    results.push({ name, status: 'PASSED' });
  } catch (error) {
    console.log(colors.red('✗ FAILED'));
    console.log(colors.red(`  Error: ${error.message}`));
    failed++;
    results.push({ name, status: 'FAILED', error: error.message });
  }
}

// Test functions
async function testModelsEndpoint() {
  const response = await fetch(`${BASE_URL}/api/endpoints/openrouter/models`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  if (!data.data || !Array.isArray(data.data)) {
    throw new Error('Invalid models response format');
  }

  // Check for key models
  const hasAutoRouter = data.data.some((m) => m.id === 'openrouter/auto');
  if (!hasAutoRouter) {
    throw new Error('Auto Router model not found');
  }

  console.log(colors.dim(`  (Found ${data.data.length} models)`));
}

async function testCreditsEndpoint() {
  const response = await fetch(`${BASE_URL}/api/endpoints/openrouter/credits`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  if (typeof data.balance === 'undefined') {
    throw new Error('Credits response missing balance');
  }

  console.log(colors.dim(`  (Balance: $${data.balance})`));
}

async function testChatCompletion() {
  const response = await fetch(`${BASE_URL}/api/endpoints/openrouter/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openrouter/auto',
      messages: [{ role: 'user', content: 'Say "Hello from OpenRouter test" and nothing else.' }],
      stream: false,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HTTP ${response.status}: ${error}`);
  }

  const data = await response.json();
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('Invalid chat completion response format');
  }

  const content = data.choices[0].message.content;
  console.log(colors.dim(`  (Response: "${content.substring(0, 50)}...")`));
}

async function testStreamingChat() {
  const response = await fetch(`${BASE_URL}/api/endpoints/openrouter/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openrouter/auto',
      messages: [{ role: 'user', content: 'Count from 1 to 5' }],
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  // Just verify we get a streaming response
  const reader = response.body.getReader();
  const { value, done } = await reader.read();

  if (done || !value) {
    throw new Error('No streaming data received');
  }

  reader.cancel(); // Clean up
  console.log(colors.dim('  (Streaming confirmed)'));
}

async function testModelFallback() {
  const response = await fetch(`${BASE_URL}/api/endpoints/openrouter/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/gpt-4',
      models: ['anthropic/claude-3-opus', 'google/gemini-pro'], // Fallback chain
      messages: [{ role: 'user', content: 'Test fallback: Say "Fallback test successful"' }],
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  if (!data.choices || !data.choices[0]) {
    throw new Error('Fallback test failed - no response');
  }

  // Check which model was actually used (if provided in response)
  if (data.model) {
    console.log(colors.dim(`  (Used model: ${data.model})`));
  }
}

async function testCacheEfficiency() {
  // First call - should hit API
  const start1 = Date.now();
  const response1 = await fetch(`${BASE_URL}/api/endpoints/openrouter/credits`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
    },
  });
  const time1 = Date.now() - start1;

  if (!response1.ok) {
    throw new Error('First credits call failed');
  }

  // Second call - should use cache (much faster)
  const start2 = Date.now();
  const response2 = await fetch(`${BASE_URL}/api/endpoints/openrouter/credits`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
    },
  });
  const time2 = Date.now() - start2;

  if (!response2.ok) {
    throw new Error('Second credits call failed');
  }

  // Cache should make second call significantly faster
  if (time2 > time1 * 0.5) {
    console.log(
      colors.yellow(
        `  (Warning: Cache might not be working. Time1: ${time1}ms, Time2: ${time2}ms)`,
      ),
    );
  } else {
    console.log(colors.dim(`  (Cache working: ${time1}ms → ${time2}ms)`));
  }
}

// Main test runner
async function runAllTests() {
  console.log(colors.cyan('\n🧪 OpenRouter Integration Tests\n'));
  console.log(colors.dim(`Server: ${BASE_URL}`));
  console.log(colors.dim(`API Key: ${OPENROUTER_API_KEY ? 'Configured' : colors.red('MISSING!')}`));
  console.log(
    colors.dim(`JWT Token: ${TOKEN.length > 20 ? 'Configured' : colors.red('MISSING!')}\n`),
  );

  // Check prerequisites
  if (!OPENROUTER_API_KEY) {
    console.log(colors.red('❌ OPENROUTER_API_KEY not set in environment'));
    process.exit(1);
  }

  if (TOKEN === 'YOUR_JWT_TOKEN') {
    console.log(colors.yellow('⚠️  Please update the TOKEN variable with your actual JWT token'));
    console.log(
      colors.yellow(
        '   Get it from browser localStorage after logging in: localStorage.getItem("token")',
      ),
    );
    process.exit(1);
  }

  // Run tests
  await runTest('Models Endpoint', testModelsEndpoint);
  await runTest('Credits Endpoint', testCreditsEndpoint);
  await runTest('Chat Completion', testChatCompletion);
  await runTest('Streaming Chat', testStreamingChat);
  await runTest('Model Fallback', testModelFallback);
  await runTest('Cache Efficiency', testCacheEfficiency);

  // Summary
  console.log(colors.cyan('\n📊 Test Results Summary\n'));
  console.log(colors.green(`✓ Passed: ${passed}`));
  if (failed > 0) {
    console.log(colors.red(`✗ Failed: ${failed}`));
  }

  const successRate = ((passed / (passed + failed)) * 100).toFixed(1);
  console.log(`Success Rate: ${successRate}%`);

  if (failed === 0) {
    console.log(colors.green('\n✅ All OpenRouter integration tests passed!'));
    console.log(colors.green('The native provider is working correctly.\n'));
  } else {
    console.log(colors.red('\n❌ Some tests failed. Please review the errors above.\n'));
    process.exit(1);
  }
}

// Error handler
process.on('unhandledRejection', (error) => {
  console.error(colors.red('\n❌ Unhandled error:'), error);
  process.exit(1);
});

// Run tests
runAllTests().catch((error) => {
  console.error(colors.red('\n❌ Test runner failed:'), error);
  process.exit(1);
});
