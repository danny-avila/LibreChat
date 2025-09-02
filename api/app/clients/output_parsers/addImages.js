const { logger } = require('~/config');

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

    const regex = /!\[.*?\]\((.*?)\)/g;
    let matchErroneous;
    while ((matchErroneous = regex.exec(responseMessage.text)) !== null) {
      if (matchErroneous[1] && !matchErroneous[1].startsWith('/images/')) {
        responseMessage.text = responseMessage.text.replace(matchErroneous[1], essentialImagePath);
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
    if (observedImagePath && !responseMessage.text.includes(observedImagePath[0])) {
      responseMessage.text += '\n' + observedImagePath[0];
      logger.debug('[addImages] added image from intermediateSteps:', observedImagePath[0]);
    }
  });
}

module.exports = addImages;
