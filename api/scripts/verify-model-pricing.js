#!/usr/bin/env node

// Standalone version of pricing data for verification
const PRICING_DATA = require('../server/services/ModelPricing').PRICING_DATA || {};

function getModelPricing(model, date = new Date()) {
  const modelPricing = PRICING_DATA[model];
  if (!modelPricing) {
    return null;
  }
  
  for (const period of modelPricing) {
    if (date >= period.effectiveFrom && (!period.effectiveTo || date <= period.effectiveTo)) {
      return period;
    }
  }
  
  return modelPricing[modelPricing.length - 1];
}

/**
 * Script to verify model pricing data
 * Usage: node api/scripts/verify-model-pricing.js
 */

console.log('Model Pricing Verification Report');
console.log('=================================\n');

// Summary statistics
const totalModels = Object.keys(PRICING_DATA).length;
const providers = new Map();
const priceRanges = {
  free: [],
  cheap: [], // < $1 per 1M tokens
  moderate: [], // $1-10 per 1M tokens
  expensive: [], // $10-50 per 1M tokens
  veryExpensive: [] // > $50 per 1M tokens
};

// Analyze each model
Object.entries(PRICING_DATA).forEach(([model, pricingHistory]) => {
  const currentPricing = pricingHistory[0];
  const avgCost = (currentPricing.prompt + currentPricing.completion) / 2;
  
  // Categorize by provider
  let provider = 'Unknown';
  if (model.includes('gpt') || model.includes('o1')) provider = 'OpenAI';
  else if (model.includes('claude')) provider = 'Anthropic';
  else if (model.includes('gemini')) provider = 'Google';
  else if (model.includes('mistral')) provider = 'Mistral';
  else if (model.includes('llama')) provider = 'Meta';
  else if (model.includes('command')) provider = 'Cohere';
  else if (model.includes('titan')) provider = 'Amazon';
  else if (model.includes('grok')) provider = 'xAI';
  else if (model.includes('deepseek')) provider = 'DeepSeek';
  
  providers.set(provider, (providers.get(provider) || 0) + 1);
  
  // Categorize by price
  if (avgCost === 0) {
    priceRanges.free.push({ model, avgCost });
  } else if (avgCost < 1) {
    priceRanges.cheap.push({ model, avgCost });
  } else if (avgCost < 10) {
    priceRanges.moderate.push({ model, avgCost });
  } else if (avgCost < 50) {
    priceRanges.expensive.push({ model, avgCost });
  } else {
    priceRanges.veryExpensive.push({ model, avgCost });
  }
});

// Print summary
console.log(`Total Models with Pricing: ${totalModels}`);
console.log('\nModels by Provider:');
providers.forEach((count, provider) => {
  console.log(`  ${provider}: ${count}`);
});

console.log('\nModels by Price Range (avg of prompt + completion):');
console.log(`  Free (experimental): ${priceRanges.free.length}`);
console.log(`  Cheap (<$1/1M tokens): ${priceRanges.cheap.length}`);
console.log(`  Moderate ($1-10/1M tokens): ${priceRanges.moderate.length}`);
console.log(`  Expensive ($10-50/1M tokens): ${priceRanges.expensive.length}`);
console.log(`  Very Expensive (>$50/1M tokens): ${priceRanges.veryExpensive.length}`);

// Show most expensive models
console.log('\nTop 10 Most Expensive Models:');
const allModels = Object.entries(PRICING_DATA)
  .map(([model, history]) => ({
    model,
    avgCost: (history[0].prompt + history[0].completion) / 2
  }))
  .sort((a, b) => b.avgCost - a.avgCost)
  .slice(0, 10);

allModels.forEach(({ model, avgCost }) => {
  const pricing = PRICING_DATA[model][0];
  console.log(`  ${model}: $${avgCost.toFixed(2)}/1M tokens (prompt: $${pricing.prompt}, completion: $${pricing.completion})`);
});

// Show models with special token types
console.log('\nModels with Special Token Types:');
Object.entries(PRICING_DATA).forEach(([model, history]) => {
  const pricing = history[0];
  const specialTypes = [];
  if (pricing.cacheWrite) specialTypes.push('cache');
  if (pricing.reasoning) specialTypes.push('reasoning');
  
  if (specialTypes.length > 0) {
    console.log(`  ${model}: ${specialTypes.join(', ')}`);
  }
});

// Verify pricing consistency
console.log('\nPricing Validation:');
let issues = 0;
Object.entries(PRICING_DATA).forEach(([model, history]) => {
  const pricing = history[0];
  
  // Check for negative prices
  if (pricing.prompt < 0 || pricing.completion < 0) {
    console.log(`  ❌ ${model}: Negative pricing detected`);
    issues++;
  }
  
  // Check for missing required fields
  if (pricing.prompt === undefined || pricing.completion === undefined) {
    console.log(`  ❌ ${model}: Missing required pricing fields`);
    issues++;
  }
  
  // Check date validity
  if (!(pricing.effectiveFrom instanceof Date) || isNaN(pricing.effectiveFrom)) {
    console.log(`  ❌ ${model}: Invalid effectiveFrom date`);
    issues++;
  }
});

if (issues === 0) {
  console.log('  ✅ All pricing data is valid');
} else {
  console.log(`  ❌ Found ${issues} issues`);
}

// Test pricing calculation
console.log('\nSample Cost Calculations:');
const testCases = [
  { model: 'gpt-4o', tokens: 1000 },
  { model: 'claude-3-5-sonnet', tokens: 10000 },
  { model: 'gemini-1.5-flash', tokens: 100000 }
];

testCases.forEach(({ model, tokens }) => {
  const pricing = getModelPricing(model);
  if (pricing) {
    const promptCost = (tokens / 1_000_000) * pricing.prompt;
    const completionCost = (tokens / 1_000_000) * pricing.completion;
    console.log(`  ${model} with ${tokens.toLocaleString()} tokens:`);
    console.log(`    Prompt: $${promptCost.toFixed(4)}, Completion: $${completionCost.toFixed(4)}`);
  }
});

console.log('\n✅ Verification complete');