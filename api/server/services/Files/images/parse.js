const URL = require('url').URL;
const path = require('path');

/**
 * Extracts the image basename from a given URL.
 *
 * @param {string} urlString - The URL string from which the image basename is to be extracted.
 * @returns {string} The basename of the image file from the URL.
 * Returns an empty string if the URL does not contain a valid image basename.
 */
function getImageBasename(urlString) {
  const url = new URL(urlString);

  const pathname = url.pathname;
  const basename = path.basename(pathname);

  return basename;
}

module.exports = {
  getImageBasename,
};
