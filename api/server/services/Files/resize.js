const sharp = require('sharp');

async function resizeImage(inputFilePath, resolution) {
  const maxLowRes = 512;
  const maxShortSideHighRes = 768;
  const maxLongSideHighRes = 2000;

  const metadata = await sharp(inputFilePath).metadata();

  // Low resolution mode
  if (resolution === 'low') {
    return sharp(inputFilePath)
      .resize({
        width: maxLowRes,
        height: maxLowRes,
        fit: 'inside',
      })
      .toBuffer();
  }

  // High resolution mode
  if (resolution === 'high') {
    const isWidthShorter = metadata.width < metadata.height;
    let newWidth, newHeight;

    if (isWidthShorter) {
      newWidth = metadata.width > maxShortSideHighRes ? maxShortSideHighRes : null;
      newHeight = metadata.height > maxLongSideHighRes ? maxLongSideHighRes : null;
    } else {
      newWidth = metadata.width > maxLongSideHighRes ? maxLongSideHighRes : null;
      newHeight = metadata.height > maxShortSideHighRes ? maxShortSideHighRes : null;
    }

    return sharp(inputFilePath)
      .resize({
        width: newWidth,
        height: newHeight,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .toBuffer();
  }

  // Invalid resolution parameter
  throw new Error('Invalid resolution parameter');
}

module.exports = { resizeImage };
