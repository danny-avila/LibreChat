const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { logger } = require('~/config');

async function saveImageFromUrl(url, outputPath, outputFilename) {
  try {
    // Fetch the image from the URL
    const response = await axios({
      url,
      responseType: 'stream',
    });

    // Get the content type from the response headers
    const contentType = response.headers['content-type'];
    let extension = contentType.split('/').pop();

    // Check if the output directory exists, if not, create it
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

    // Replace or append the correct extension
    const extRegExp = new RegExp(path.extname(outputFilename) + '$');
    outputFilename = outputFilename.replace(extRegExp, `.${extension}`);
    if (!path.extname(outputFilename)) {
      outputFilename += `.${extension}`;
    }

    // Create a writable stream for the output path
    const outputFilePath = path.join(outputPath, outputFilename);
    const writer = fs.createWriteStream(outputFilePath);

    // Pipe the response data to the output file
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  } catch (error) {
    logger.error('[saveImageFromUrl] Error while saving the image:', error);
  }
}

module.exports = saveImageFromUrl;
