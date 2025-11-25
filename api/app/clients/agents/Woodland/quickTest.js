/**
 * Quick Test Runner for Woodland Agent Prompts
 * Usage: node api/app/clients/agents/Woodland/quickTest.js
 */

const testPrompts = require('./testPrompts');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function formatPrompt(promptObj) {
  console.log(`\n${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.blue}Test Case:${colors.reset} ${promptObj.test_case}`);
  console.log(`${colors.gray}Prompt:${colors.reset} "${promptObj.prompt}"`);
  console.log(`\n${colors.yellow}Expected Behavior:${colors.reset}`);
  
  Object.entries(promptObj.expected_behavior).forEach(([key, value]) => {
    const displayValue = typeof value === 'object' && value !== null
      ? JSON.stringify(value)
      : String(value);
    console.log(`  • ${key}: ${colors.green}${displayValue}${colors.reset}`);
  });
  
  console.log(`${colors.cyan}───────────────────────────────────────────────────────────${colors.reset}`);
}

function displayAgentPrompts(agentName, prompts) {
  console.log(`\n\n${colors.blue}╔═══════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.blue}║${colors.reset}  ${agentName.toUpperCase()} AGENT - TEST PROMPTS`);
  console.log(`${colors.blue}╚═══════════════════════════════════════════════════════════╝${colors.reset}`);
  
  Object.entries(prompts).forEach(([key, promptObj]) => {
    formatPrompt(promptObj);
  });
}

function displayCriticalScenarios() {
  console.log(`\n\n${colors.red}╔═══════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.red}║${colors.reset}  PHASE 1 CRITICAL TEST SCENARIOS`);
  console.log(`${colors.red}╚═══════════════════════════════════════════════════════════╝${colors.reset}`);
  
  testPrompts.TEST_SCENARIOS.phase_1_critical.forEach((scenario) => {
    formatPrompt(scenario);
  });
}

// Main execution
function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help')) {
    console.log(`
${colors.blue}Woodland Agent Test Prompt Viewer${colors.reset}

${colors.yellow}Usage:${colors.reset}
  node quickTest.js [options]

${colors.yellow}Options:${colors.reset}
  --all              Show all agent prompts
  --catalog          Show Catalog Parts Agent prompts
  --cyclopedia       Show Cyclopedia Support Agent prompts
  --tractor          Show Tractor Fitment Agent prompts
  --website          Show Website Product Agent prompts
  --cases            Show Cases Reference Agent prompts
  --supervisor       Show Supervisor Router prompts
  --critical         Show Phase 1 critical test scenarios
  --help             Show this help message

${colors.yellow}Examples:${colors.reset}
  node quickTest.js --critical
  node quickTest.js --catalog
  node quickTest.js --cyclopedia
  node quickTest.js --all
    `);
    return;
  }
  
  if (args.includes('--critical')) {
    displayCriticalScenarios();
  }
  
  if (args.includes('--catalog') || args.includes('--all')) {
    displayAgentPrompts('Catalog Parts', testPrompts.CATALOG_PARTS_AGENT_PROMPTS);
  }
  
  if (args.includes('--cyclopedia') || args.includes('--all')) {
    displayAgentPrompts('Cyclopedia Support', testPrompts.CYCLOPEDIA_SUPPORT_AGENT_PROMPTS);
  }
  
  if (args.includes('--tractor') || args.includes('--all')) {
    displayAgentPrompts('Tractor Fitment', testPrompts.TRACTOR_FITMENT_AGENT_PROMPTS);
  }
  
  if (args.includes('--website') || args.includes('--all')) {
    displayAgentPrompts('Website Product', testPrompts.WEBSITE_PRODUCT_AGENT_PROMPTS);
  }
  
  if (args.includes('--cases') || args.includes('--all')) {
    displayAgentPrompts('Cases Reference', testPrompts.CASES_REFERENCE_AGENT_PROMPTS);
  }
  
  if (args.includes('--supervisor') || args.includes('--all')) {
    displayAgentPrompts('Supervisor Router', testPrompts.SUPERVISOR_ROUTER_PROMPTS);
  }
  
  console.log('\n');
}

main();
