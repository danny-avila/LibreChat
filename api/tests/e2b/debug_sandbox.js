const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });
const { Sandbox } = require('@e2b/code-interpreter');

async function debugSandbox() {
  console.log('🚀 Starting E2B Sandbox Debugger...');
  const apiKey = process.env.E2B_API_KEY;
  if (!apiKey) {
    console.error('❌ E2B_API_KEY not found in .env');
    return;
  }

  // Try specific template IDs
  // Docs mention 'code-interpreter-v1' is the base. 
  const template = 'code-interpreter-v1'; 
  console.log(`
📦 Creating sandbox with template: "${template}"...`);
  console.log('   (Timeout set to 60s for debug)');

  let sandbox;
  try {
    const startTime = Date.now();
    sandbox = await Sandbox.create(template, {
      apiKey,
      timeoutMs: 60000, 
      secure: false // Explicitly disable secure to match our app config
    });
    console.log(`✅ Sandbox created in ${(Date.now() - startTime) / 1000}s`);
    console.log(`   ID: ${sandbox.sandboxId}`);

    // 1. Test basic command execution (Shell)
    console.log('\n🔍 Test 1: Shell Execution (ls -la /home/user)');
    const cmd = await sandbox.commands.run('ls -la /home/user');
    console.log('   Stdout:', cmd.stdout);
    console.log('   Stderr:', cmd.stderr);

    // 2. Check running processes
    console.log('\n🔍 Test 2: Checking Processes (ps aux)');
    const ps = await sandbox.commands.run('ps aux');
    console.log('   Processes:\n', ps.stdout);

    // 3. Test Code Execution (Python)
    console.log('\n🔍 Test 3: Python Code Execution');
    const exec = await sandbox.runCode('print("Hello form E2B Debugger")');
    console.log('   Result:', exec);

  } catch (error) {
    console.error('\n❌ Debugging Failed:', error);
    if (error.message.includes('502')) {
      console.log('\n💡 Analysis: 502 Error means the Code Interpreter service inside the sandbox is not reachable.');
      console.log('   - If Test 1 & 2 passed: The sandbox is alive, but the Python kernel server failed to start.');
      console.log('   - If Test 1 & 2 failed: The sandbox failed to start entirely or network is blocked.');
    }
  } finally {
    if (sandbox) {
      console.log('\n🧹 Killing sandbox...');
      await sandbox.kill();
      console.log('✅ Sandbox killed.');
    }
  }
}

debugSandbox();
