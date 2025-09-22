#!/usr/bin/env node

/**
 * Test script to verify OpenRouter integration with Agent system
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

// Test 1: Check if OpenRouter is in EModelEndpoint
const { EModelEndpoint } = require('librechat-data-provider');
console.log('\n=== Test 1: EModelEndpoint includes OpenRouter ===');
console.log('OpenRouter endpoint:', EModelEndpoint.openrouter);
console.log('Is OpenRouter defined?', EModelEndpoint.openrouter === 'openrouter');

// Test 2: Check if OpenRouter is in providerConfigMap
const { getProviderConfig } = require('./api/server/services/Endpoints');
console.log('\n=== Test 2: Provider Config Map ===');
try {
  const config = getProviderConfig({ provider: 'openrouter', appConfig: {} });
  console.log('OpenRouter config exists:', !!config.getOptions);
  console.log('Override provider:', config.overrideProvider);
} catch (error) {
  console.log('Error getting OpenRouter config:', error.message);
}

// Test 3: Check if OpenRouter appears in EndpointService
const endpointService = require('./api/server/services/Config/EndpointService');
console.log('\n=== Test 3: EndpointService Configuration ===');
console.log('OpenRouter in config:', !!endpointService.config[EModelEndpoint.openrouter]);
console.log('OpenRouter API key env var:', !!process.env.OPENROUTER_API_KEY);

// Test 4: Check if OpenRouter client exists
console.log('\n=== Test 4: OpenRouter Client ===');
try {
  const OpenRouterClient = require('./api/app/clients/OpenRouterClient');
  console.log('OpenRouterClient exists:', !!OpenRouterClient);
  console.log('OpenRouterClient is a class:', typeof OpenRouterClient === 'function');
} catch (error) {
  console.log('Error loading OpenRouterClient:', error.message);
}

// Test 5: Check initialization function
console.log('\n=== Test 5: OpenRouter Initialization ===');
try {
  const initOpenRouter = require('./api/server/services/Endpoints/openrouter/initialize');
  console.log('initOpenRouter exists:', !!initOpenRouter);
  console.log('initOpenRouter is a function:', typeof initOpenRouter === 'function');
} catch (error) {
  console.log('Error loading initOpenRouter:', error.message);
}

console.log('\n=== Summary ===');
console.log('OpenRouter should appear in Agent Builder UI if all tests pass.');
console.log('Note: The UI will only show OpenRouter if OPENROUTER_API_KEY is configured.');
