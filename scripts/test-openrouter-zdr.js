#!/usr/bin/env node

/**
 * Test script for OpenRouter ZDR (Zero Data Retention) functionality
 * Tests how different models behave with and without ZDR enabled
 */

const axios = require('axios');
require('dotenv').config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const API_BASE = 'https://openrouter.ai/api/v1';

if (!OPENROUTER_API_KEY) {
  console.error('❌ OPENROUTER_API_KEY not found in environment');
  process.exit(1);
}

// Test models - mix of providers with different privacy policies
const TEST_MODELS = [
  { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus', expectZDR: true },
  { id: 'openai/gpt-4-turbo', name: 'GPT-4 Turbo', expectZDR: 'maybe' },
  { id: 'google/gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash', expectZDR: 'maybe' },
  { id: 'mistralai/mistral-large', name: 'Mistral Large', expectZDR: true },
  { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B', expectZDR: false },
  { id: 'x-ai/grok-2', name: 'Grok 2', expectZDR: false },
];

const TEST_MESSAGE = {
  role: 'user',
  content: 'Say "ZDR test successful" and nothing else.',
};

async function testModel(model, withZDR = false) {
  try {
    console.log(`\nTesting ${model.name} (${model.id}) ${withZDR ? 'WITH' : 'WITHOUT'} ZDR...`);

    const requestBody = {
      model: model.id,
      messages: [TEST_MESSAGE],
      max_tokens: 20,
      temperature: 0,
    };

    if (withZDR) {
      requestBody.zdr = true;
    }

    const response = await axios.post(
      `${API_BASE}/chat/completions`,
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3080',
          'X-Title': 'LibreChat ZDR Test',
        },
        validateStatus: () => true, // Don't throw on error status codes
      }
    );

    if (response.status === 200) {
      const content = response.data.choices?.[0]?.message?.content || 'No content';
      console.log(`✅ Success: "${content.trim()}"`);
      return { success: true, model: model.id, withZDR };
    } else if (response.status === 404) {
      const errorMsg = response.data?.error?.message || 'Unknown error';
      if (errorMsg.includes('data policy')) {
        console.log(`🚫 Blocked by privacy policy: ${errorMsg}`);
        return { success: false, model: model.id, withZDR, blockedByPolicy: true };
      } else {
        console.log(`❌ 404 Error: ${errorMsg}`);
        return { success: false, model: model.id, withZDR, error: errorMsg };
      }
    } else {
      console.log(`❌ Error ${response.status}: ${JSON.stringify(response.data)}`);
      return { success: false, model: model.id, withZDR, error: response.data };
    }
  } catch (error) {
    console.log(`❌ Request failed: ${error.message}`);
    return { success: false, model: model.id, withZDR, error: error.message };
  }
}

async function runTests() {
  console.log('🧪 OpenRouter ZDR Testing Suite');
  console.log('================================');
  console.log(`Using API Key: ${OPENROUTER_API_KEY.substring(0, 10)}...`);

  const results = {
    withoutZDR: [],
    withZDR: [],
  };

  // First, test all models WITHOUT ZDR
  console.log('\n📋 Phase 1: Testing WITHOUT ZDR Parameter');
  console.log('------------------------------------------');
  for (const model of TEST_MODELS) {
    const result = await testModel(model, false);
    results.withoutZDR.push(result);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting
  }

  // Then test all models WITH ZDR
  console.log('\n📋 Phase 2: Testing WITH ZDR Parameter');
  console.log('---------------------------------------');
  for (const model of TEST_MODELS) {
    const result = await testModel(model, true);
    results.withZDR.push(result);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting
  }

  // Summary
  console.log('\n📊 Test Summary');
  console.log('================');

  console.log('\nWithout ZDR:');
  const withoutZDRSuccess = results.withoutZDR.filter(r => r.success).length;
  const withoutZDRBlocked = results.withoutZDR.filter(r => r.blockedByPolicy).length;
  console.log(`  ✅ Successful: ${withoutZDRSuccess}/${TEST_MODELS.length}`);
  console.log(`  🚫 Blocked by policy: ${withoutZDRBlocked}/${TEST_MODELS.length}`);

  console.log('\nWith ZDR:');
  const withZDRSuccess = results.withZDR.filter(r => r.success).length;
  const withZDRBlocked = results.withZDR.filter(r => r.blockedByPolicy).length;
  console.log(`  ✅ Successful: ${withZDRSuccess}/${TEST_MODELS.length}`);
  console.log(`  🚫 Blocked by policy: ${withZDRBlocked}/${TEST_MODELS.length}`);

  console.log('\n🔍 Analysis:');
  console.log('-------------');

  // Check if ZDR made a difference
  const modelsUnblockedByZDR = [];
  const modelsStillBlocked = [];

  for (let i = 0; i < TEST_MODELS.length; i++) {
    const withoutZDR = results.withoutZDR[i];
    const withZDR = results.withZDR[i];

    if (withoutZDR.blockedByPolicy && withZDR.success) {
      modelsUnblockedByZDR.push(TEST_MODELS[i].name);
    } else if (withoutZDR.blockedByPolicy && withZDR.blockedByPolicy) {
      modelsStillBlocked.push(TEST_MODELS[i].name);
    }
  }

  if (modelsUnblockedByZDR.length > 0) {
    console.log('✨ Models that work WITH ZDR but not without:');
    modelsUnblockedByZDR.forEach(m => console.log(`   - ${m}`));
  }

  if (modelsStillBlocked.length > 0) {
    console.log('⚠️  Models blocked even WITH ZDR (may not support ZDR):');
    modelsStillBlocked.forEach(m => console.log(`   - ${m}`));
  }

  console.log('\n✅ ZDR functionality test complete!');
  console.log('\nNote: Results depend on your OpenRouter account privacy settings.');
  console.log('Visit https://openrouter.ai/settings/privacy to adjust settings.');
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});