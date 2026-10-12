import { access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

for (const path of [
  'public/index.html',
  'public/404.html',
  'public/_redirects',
  'public/app.js',
  'public/core.js',
  'public/style.css',
  'functions/api/[[path]].js',
]) {
  await access(new URL(`../${path}`, import.meta.url));
}

execFileSync(process.execPath, ['--check', new URL('../public/app.js', import.meta.url).pathname], {
  stdio: 'inherit',
});
execFileSync(process.execPath, ['--check', new URL('../public/core.js', import.meta.url).pathname], {
  stdio: 'inherit',
});

await import('../functions/api/[[path]].js');
await import('../functions/oauth/openid/index.js');
await import('../functions/oauth/openid/callback.js');
console.log('Meo Pages source is ready for Cloudflare Pages.');
