const { spawn } = require('child_process');
const path = require('path');

const rootPath = path.resolve(__dirname, '../..');
const migrationPath = path.resolve(rootPath, 'config/migrate-mcp-authority.js');

function prepareMCPAuthority(mongoUri) {
  if (!mongoUri) {
    throw new Error('[e2e] MCP authority preparation requires MONGO_URI');
  }

  return new Promise((resolve, reject) => {
    const migration = spawn(process.execPath, [migrationPath], {
      cwd: rootPath,
      env: { ...process.env, MONGO_URI: mongoUri },
      stdio: 'inherit',
    });
    migration.once('error', reject);
    migration.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(`[e2e] MCP authority preparation failed (${signal || `code ${String(code)}`})`),
      );
    });
  });
}

module.exports = { prepareMCPAuthority };
