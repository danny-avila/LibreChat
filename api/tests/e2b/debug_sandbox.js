const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });
const { Sandbox } = require('@e2b/code-interpreter');

async function debugSandbox() {
  console.log('🚀 Starting E2B Sandbox Debugger (Data Science Stack)...');
  const apiKey = process.env.E2B_API_KEY;
  const template = 'xed696qfsyzpaei3ulh5'; // Your custom template ID

  console.log(`📦 Creating sandbox with template: "${template}"...`);

  let sandbox;
  try {
    const startTime = Date.now();
    sandbox = await Sandbox.create(template, {
      apiKey,
      timeoutMs: 60000, 
      secure: false
    });
    console.log(`✅ Sandbox created in ${(Date.now() - startTime) / 1000}s`);

    // Test Python Imports
    const pythonCheck = `
import sys
packages = ['numpy', 'pandas', 'scikit-learn', 'xgboost', 'torch', 'nltk']
results = {}

print("--- Package Status ---")
for pkg in packages:
    try:
        # Handle special import names
        import_name = pkg
        if pkg == 'scikit-learn': import_name = 'sklearn'
        
        module = __import__(import_name)
        results[pkg] = "✅ " + getattr(module, '__version__', 'installed')
    except ImportError as e:
        results[pkg] = f"❌ Missing ({e})"
    except Exception as e:
        results[pkg] = f"❌ Error ({e})"

for k, v in results.items():
    print(f"{k}: {v}")
    `;

    console.log('\n🔍 Running Package Check...');
    const exec = await sandbox.runCode(pythonCheck);
    
    if (exec.logs.stdout.length > 0) {
        console.log(exec.logs.stdout.map(l => l.message || l).join(''));
    }
    if (exec.logs.stderr.length > 0) {
        console.log('⚠️ STDERR:', exec.logs.stderr.map(l => l.message || l).join(''));
    }

    if (exec.error) {
        console.error('❌ Execution Error:', exec.error);
    }

  } catch (error) {
    console.error('\n❌ Debugging Failed:', error);
  } finally {
    if (sandbox) {
      await sandbox.kill();
      console.log('\n✅ Sandbox killed.');
    }
  }
}

debugSandbox();
