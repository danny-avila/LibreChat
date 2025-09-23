#!/usr/bin/env node

// Test script to verify LobeHub CDN icon availability
const https = require('https');

const testProviders = [
  'openai',
  'anthropic',
  'google',
  'meta',
  'mistral',
  'deepseek',
  'alibaba',
  'amazon',
  'nvidia',
  'huggingface',
  'baidu',
  'bytedance',
  'cohere',
  'perplexity',
  'x-ai',
  'qwen',
  'moonshot',
  'yi',
  'zhipu',
];

console.log('Testing LobeHub CDN icon availability...\n');

async function checkIcon(provider) {
  return new Promise((resolve) => {
    const svgUrl = `https://icons.lobehub.com/${provider}.svg`;

    https.get(svgUrl, (res) => {
      if (res.statusCode === 200) {
        console.log(`✅ ${provider}: Available at ${svgUrl}`);
        resolve(true);
      } else {
        console.log(`❌ ${provider}: Not found (${res.statusCode})`);
        resolve(false);
      }
    }).on('error', (err) => {
      console.log(`❌ ${provider}: Error - ${err.message}`);
      resolve(false);
    });
  });
}

async function testAllProviders() {
  let available = 0;
  let notFound = 0;

  for (const provider of testProviders) {
    const found = await checkIcon(provider);
    if (found) available++;
    else notFound++;
  }

  console.log(`\n=== Summary ===`);
  console.log(`Available: ${available}/${testProviders.length}`);
  console.log(`Not found: ${notFound}/${testProviders.length}`);

  if (available > 0) {
    console.log(`\n✅ LobeHub CDN is accessible and has icons available!`);
  } else {
    console.log(`\n⚠️  Unable to access LobeHub CDN or no icons found.`);
  }
}

testAllProviders();