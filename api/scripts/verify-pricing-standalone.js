#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read the pricing file directly
const pricingFile = path.join(__dirname, '../server/services/ModelPricing.js');
const fileContent = fs.readFileSync(pricingFile, 'utf-8');

// Extract PRICING_DATA object using regex
const pricingDataMatch = fileContent.match(/const PRICING_DATA = \{[\s\S]*?\n\};/);
if (!pricingDataMatch) {
  console.error('Could not find PRICING_DATA in ModelPricing.js');
  process.exit(1);
}

// Count models
const modelMatches = fileContent.match(/['"][\w\-\.:]+['"]:\s*\[/g) || [];
const totalModels = modelMatches.length;

console.log('Model Pricing Verification Report');
console.log('=================================\n');
console.log(`Total Models with Pricing: ${totalModels}`);

// Extract model names and categorize by provider
const providers = new Map();
const modelsByProvider = {
  'OpenAI': [],
  'Anthropic': [],
  'Google': [],
  'Meta': [],
  'Mistral': [],
  'Cohere': [],
  'Amazon': [],
  'xAI': [],
  'DeepSeek': [],
  'AI21': [],
  'Unknown': []
};

modelMatches.forEach(match => {
  const model = match.match(/['"](.+?)['"]/)[1];
  
  let provider = 'Unknown';
  if (model.includes('gpt') || model.includes('o1') || model.includes('chatgpt')) provider = 'OpenAI';
  else if (model.includes('claude') || model.startsWith('anthropic.')) provider = 'Anthropic';
  else if (model.includes('gemini')) provider = 'Google';
  else if (model.includes('llama') || model.startsWith('meta.')) provider = 'Meta';
  else if (model.includes('mistral')) provider = 'Mistral';
  else if (model.includes('command') || model.startsWith('cohere.')) provider = 'Cohere';
  else if (model.includes('titan') || model.startsWith('amazon.')) provider = 'Amazon';
  else if (model.includes('grok')) provider = 'xAI';
  else if (model.includes('deepseek')) provider = 'DeepSeek';
  else if (model.startsWith('ai21.')) provider = 'AI21';
  
  modelsByProvider[provider].push(model);
  providers.set(provider, (providers.get(provider) || 0) + 1);
});

console.log('\nModels by Provider:');
Object.entries(modelsByProvider).forEach(([provider, models]) => {
  if (models.length > 0) {
    console.log(`\n${provider} (${models.length} models):`);
    models.forEach(model => console.log(`  - ${model}`));
  }
});

// Check for special token types
console.log('\n\nSpecial Token Types:');
const cacheModels = fileContent.match(/cacheWrite:/g) || [];
const reasoningModels = fileContent.match(/reasoning:/g) || [];
console.log(`  Models with cache pricing: ${cacheModels.length}`);
console.log(`  Models with reasoning pricing: ${reasoningModels.length}`);

console.log('\n✅ Verification complete');
console.log('\nTo test pricing calculations, run the backend with:');
console.log('  npm run backend:dev');
console.log('\nThen check the cost display in the chat header.');