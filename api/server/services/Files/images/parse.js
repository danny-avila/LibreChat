const URL = require('url').URL;
const path = require('path');

const imageExtensionRegex = /\.(jpg|jpeg|png|gif|bmp|tiff|svg)$/i;

/**
 * Extracts the image basename from a given URL.
 *
 * @param {string} urlString - The URL string from which the image basename is to be extracted.
 * @returns {string} The basename of the image file from the URL.
 * Returns an empty string if the URL does not contain a valid image basename.
 */
function getImageBasename(urlString) {
  try {
    const url = new URL(urlString);
    const basename = path.basename(url.pathname);

    return imageExtensionRegex.test(basename) ? basename : '';
  } catch (error) {
    // If URL parsing fails, return an empty string
    return '';
  }
}

module.exports = {
  getImageBasename,
};
