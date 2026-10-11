import { access } from 'node:fs/promises';

for (const path of ['public/index.html', 'public/app.js', 'public/style.css', 'functions/api/[[path]].js']) {
  await access(new URL(`../${path}`, import.meta.url));
}
console.log('Meo Pages source is ready for Cloudflare Pages.');
