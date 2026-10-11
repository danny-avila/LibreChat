import { access } from 'node:fs/promises';

for (const path of ['public/index.html', 'public/app.js', 'public/style.css', 'functions/api/[[path]].js']) {
  await access(new URL(`../${path}`, import.meta.url));
}
await import('../functions/api/[[path]].js');
await import('../functions/oauth/openid/index.js');
await import('../functions/oauth/openid/callback.js');
console.log('Meo Pages source is ready for Cloudflare Pages.');
