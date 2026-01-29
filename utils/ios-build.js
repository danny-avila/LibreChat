const { networkInterfaces } = require('os');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const nets = networkInterfaces();
let ip = 'localhost';

for (const name of Object.keys(nets)) {
  for (const net of nets[name] || []) {
    if (net.family === 'IPv4' && !net.internal) {
      ip = net.address;
      break;
    }
  }
  if (ip !== 'localhost') {
    break;
  }
}

const envPath = path.join(process.cwd(), '.env');
if (!process.env.LIBRECHAT_API_URL && fs.existsSync(envPath)) {
  const contents = fs.readFileSync(envPath, 'utf8');
  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, eqIndex).trim();
    if (key !== 'LIBRECHAT_API_URL') {
      continue;
    }
    const rawValue = trimmed.slice(eqIndex + 1).trim();
    const unquoted = rawValue.replace(/^['"]|['"]$/g, '');
    if (unquoted) {
      process.env.LIBRECHAT_API_URL = unquoted;
    }
    break;
  }
}

const requestedUrl = process.env.LIBRECHAT_API_URL;
const isAuto =
  !requestedUrl ||
  requestedUrl.toLowerCase() === 'auto' ||
  requestedUrl.toLowerCase() === 'detect';
const apiUrl = isAuto ? `http://${ip}:3080` : requestedUrl;
console.log(`iOS build using API base: ${apiUrl}`);

const run = (args, env) => {
  const result = spawnSync('npm', args, {
    stdio: 'inherit',
    env: env ?? process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

run(['run', 'build:data-provider']);
run(['run', 'build:client'], {
  ...process.env,
  LIBRECHAT_API_URL: apiUrl,
  VITE_API_BASE_URL: apiUrl,
});
