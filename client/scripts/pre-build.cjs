const fs = require('fs-extra');
const path = require('path');

async function preBuild() {
  try {
    // Ensure dist/assets directory exists
    await fs.ensureDir(path.resolve(__dirname, '../dist/assets'));
    
    // Copy public assets to dist before Vite build
    const publicAssets = path.resolve(__dirname, '../public/assets');
    const distAssets = path.resolve(__dirname, '../dist/assets');
    
    if (await fs.pathExists(publicAssets)) {
      await fs.copy(publicAssets, distAssets);
      console.log('✅ Pre-build: Copied public/assets to dist/assets for PWA precache');
    }
  } catch (err) {
    console.error('❌ Pre-build copy error:', err);
    process.exit(1);
  }
}

preBuild();
