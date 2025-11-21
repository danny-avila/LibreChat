const { getBasePath } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');

/**
 * The `addImages` function corrects any erroneous image URLs in the `responseMessage.text`
 * and appends image observations from `intermediateSteps` if they are not already present.
 *
 * @function
 * @module addImages
 *
 * @param {Array.<Object>} intermediateSteps - An array of objects, each containing an observation.
 * @param {Object} responseMessage - An object containing the text property which might have image URLs.
 *
 * @property {string} intermediateSteps[].observation - The observation string which might contain an image markdown.
 * @property {string} responseMessage.text - The text which might contain image URLs.
 *
 * @example
 *
 * const intermediateSteps = [
 *   { observation: '![desc](/images/test.png)' }
 * ];
 * const responseMessage = { text: 'Some text with ![desc](sandbox:/images/test.png)' };
 *
 * addImages(intermediateSteps, responseMessage);
 *
 * logger.debug(responseMessage.text);
 * // Outputs: 'Some text with ![desc](/images/test.png)\n![desc](/images/test.png)'
 *
 * @returns {void}
 */
function addImages(intermediateSteps, responseMessage) {
  if (!intermediateSteps || !responseMessage) {
    return;
  }

  const basePath = getBasePath();

  // Correct any erroneous URLs in the responseMessage.text first
  intermediateSteps.forEach((step) => {
    const { observation } = step;
    if (!observation || !observation.includes('![')) {
      return;
    }

    const match = observation.match(/\/images\/.*\.\w*/);
    if (!match) {
      return;
    }
    const essentialImagePath = match[0];
    const fullImagePath = `${basePath}${essentialImagePath}`;

    const regex = /!\[.*?\]\((.*?)\)/g;
    let matchErroneous;
    while ((matchErroneous = regex.exec(responseMessage.text)) !== null) {
      if (matchErroneous[1] && !matchErroneous[1].startsWith(`${basePath}/images/`)) {
        // Replace with the full path including base path
        responseMessage.text = responseMessage.text.replace(matchErroneous[1], fullImagePath);
      }
    }
  });

  // Now, check if the responseMessage already includes the correct image file path and append if not
  intermediateSteps.forEach((step) => {
    const { observation } = step;
    if (!observation || !observation.includes('![')) {
      return;
    }
    const observedImagePath = observation.match(/!\[[^(]*\]\([^)]*\)/g);
    if (observedImagePath) {
      // Fix the image path to include base path if it doesn't already
      let imageMarkdown = observedImagePath[0];
      const urlMatch = imageMarkdown.match(/\(([^)]+)\)/);
      if (
        urlMatch &&
        urlMatch[1] &&
        !urlMatch[1].startsWith(`${basePath}/images/`) &&
        urlMatch[1].startsWith('/images/')
      ) {
        imageMarkdown = imageMarkdown.replace(urlMatch[1], `${basePath}${urlMatch[1]}`);
      }

      if (!responseMessage.text.includes(imageMarkdown)) {
        responseMessage.text += '\n' + imageMarkdown;
        logger.debug('[addImages] added image from intermediateSteps:', imageMarkdown);
      }
    }
  });
}

module.exports = addImages;
