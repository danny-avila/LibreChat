#!/usr/bin/env node

/**
 * Check if documentation submodule is up-to-date
 * Warns developers if docs-site submodule is behind remote
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SUBMODULE_PATH = 'docs-site';
const SUBMODULE_DIR = path.join(process.cwd(), SUBMODULE_PATH);

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function exec(command, options = {}) {
  try {
    return execSync(command, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options,
    }).trim();
  } catch (error) {
    return null;
  }
}

function checkSubmoduleExists() {
  if (!fs.existsSync(SUBMODULE_DIR)) {
    log('\n⚠️  Documentation submodule not initialized', 'yellow');
    log('   Run: git submodule update --init --recursive\n', 'cyan');
    return false;
  }
  return true;
}

function checkSubmoduleStatus() {
  if (!checkSubmoduleExists()) {
    return;
  }

  // Get current submodule commit
  const currentCommit = exec(`git rev-parse HEAD`, { cwd: SUBMODULE_DIR });
  
  if (!currentCommit) {
    log('\n⚠️  Unable to check documentation submodule status', 'yellow');
    return;
  }

  // Fetch latest from remote
  exec('git fetch origin', { cwd: SUBMODULE_DIR });

  // Get remote HEAD commit
  const remoteCommit = exec('git rev-parse origin/HEAD', { cwd: SUBMODULE_DIR }) ||
                       exec('git rev-parse origin/main', { cwd: SUBMODULE_DIR }) ||
                       exec('git rev-parse origin/master', { cwd: SUBMODULE_DIR });

  if (!remoteCommit) {
    log('\n⚠️  Unable to fetch remote documentation status', 'yellow');
    return;
  }

  // Check if behind
  if (currentCommit === remoteCommit) {
    log('\n✓ Documentation submodule is up-to-date', 'green');
    return;
  }

  // Count commits behind
  const commitsBehind = exec(
    `git rev-list --count ${currentCommit}..${remoteCommit}`,
    { cwd: SUBMODULE_DIR }
  );

  if (commitsBehind && parseInt(commitsBehind) > 0) {
    log('\n⚠️  Documentation submodule is behind', 'yellow');
    log(`   ${commitsBehind} commit(s) behind remote`, 'yellow');
    log('   Run: git submodule update --remote docs-site\n', 'cyan');
    
    // Show recent commits from remote
    const recentCommits = exec(
      `git log --oneline ${currentCommit}..${remoteCommit} -5`,
      { cwd: SUBMODULE_DIR }
    );
    
    if (recentCommits) {
      log('   Recent documentation updates:', 'cyan');
      recentCommits.split('\n').forEach(commit => {
        log(`   - ${commit}`, 'cyan');
      });
      log('');
    }
  }
}

// Main execution
if (process.env.SKIP_DOCS_CHECK !== 'true') {
  checkSubmoduleStatus();
}
