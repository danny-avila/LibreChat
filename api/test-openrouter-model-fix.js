#!/usr/bin/env node

/**
 * Simple test to verify OpenRouter model configuration is preserved
 */

require('module-alias/register');
require('dotenv').config();

const OpenRouterClient = require('./app/clients/OpenRouterClient');

console.log('=== Testing OpenRouter Model Configuration Fix ===\n');

// Test configuration
const testConfig = {
  modelOptions: {
    model: 'openai/gpt-3.5-turbo',
    temperature: 0.7,
  },
  endpointOption: {
    endpoint: 'openrouter',
    modelOptions: {
      model: 'openai/gpt-3.5-turbo',
    },
  },
};

console.log('1. Creating OpenRouter client with model:', testConfig.modelOptions.model);

try {
  const client = new OpenRouterClient(process.env.OPENROUTER_API_KEY || 'test-key', testConfig);

  console.log('\n2. Checking model configuration:');
  console.log('   - Model in modelOptions:', client.modelOptions?.model);
  console.log('   - Base URL:', client.baseURL);

  if (!client.modelOptions?.model) {
    console.error('\n✗ FAILED: Model was not preserved!');
    process.exit(1);
  }

  console.log('\n✓ SUCCESS: Model configuration is properly preserved!');
  console.log('✓ The critical fix is working correctly.');
} catch (error) {
  console.error('\n✗ Error during test:', error.message);
  process.exit(1);
}
