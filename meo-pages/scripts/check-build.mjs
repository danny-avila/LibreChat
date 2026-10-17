import { access, readFile } from 'node:fs/promises';

for (const path of [
  'dist/index.html',
  'dist/assets',
  'functions/api/[[path]].js',
  'functions/oauth/openid/index.js',
  'functions/oauth/openid/callback.js',
]) {
  await access(new URL(`../${path}`, import.meta.url));
}

const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
if (/\/app\.js|\/core\.js|\/style\.css/.test(html)) {
  throw new Error('Pages output still references the legacy meo-pages UI.');
}

await import('../functions/api/[[path]].js');
await import('../functions/oauth/openid/index.js');
await import('../functions/oauth/openid/callback.js');
console.log('React Meo AI Web output and temporary Pages auth edge are ready.');
