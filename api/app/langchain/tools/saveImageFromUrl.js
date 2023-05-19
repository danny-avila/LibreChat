const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function saveImageFromUrl(url, outputPath, outputFilename) {
  try {
    // Fetch the image from the URL
    const response = await axios({
      url,
      responseType: 'stream'
    });

    // Check if the output directory exists, if not, create it
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

    // Ensure the output filename has a '.png' extension
    const filenameWithPngExt = outputFilename.endsWith('.png')
      ? outputFilename
      : `${outputFilename}.png`;

    // Create a writable stream for the output path
    const outputFilePath = path.join(outputPath, filenameWithPngExt);
    const writer = fs.createWriteStream(outputFilePath);

    // Pipe the response data to the output file
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  } catch (error) {
    console.error('Error while saving the image:', error);
  }
}

module.exports = saveImageFromUrl;
