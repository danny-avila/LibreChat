const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, '../dist');
const manifest = JSON.parse(fs.readFileSync(path.join(distDir, 'manifest.webmanifest'), 'utf8'));
const serviceWorker = fs.readFileSync(path.join(distDir, 'sw.js'), 'utf8');
const iconPaths = manifest.icons.map((icon) => icon.src);
const missingFiles = iconPaths.filter((iconPath) => !fs.existsSync(path.join(distDir, iconPath)));
const missingPrecacheEntries = iconPaths.filter((iconPath) => !serviceWorker.includes(iconPath));

if (missingFiles.length || missingPrecacheEntries.length) {
  console.error('❌ PWA build verification failed.', {
    missingFiles,
    missingPrecacheEntries,
  });
  process.exit(1);
}

if (!fs.existsSync(path.join(distDir, 'robots.txt'))) {
  console.error('❌ PWA build verification failed: robots.txt was not copied.');
  process.exit(1);
}

console.log('✅ PWA icons are copied and precached, and robots.txt is present.');
