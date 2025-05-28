// scripts/remove-images.cjs
const fs = require('fs-extra');

async function removeImages() {
  try {
    const imagesPath = './dist/images';
    if (await fs.pathExists(imagesPath)) {
      await fs.remove(imagesPath);
      console.log('✅ Post-build completed successfully.');
    }
  } catch (err) {
    console.error('❌ Error removing images:', err);
    process.exit(1);
  }
}

removeImages();
