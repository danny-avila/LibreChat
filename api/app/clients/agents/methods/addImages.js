function addImages(intermediateSteps, responseMessage) {
  if (!intermediateSteps || !responseMessage) {
    return;
  }

  intermediateSteps.forEach((step) => {
    const { observation } = step;
    if (!observation || !observation.includes('![')) {
      return;
    }

    // Extract the image file path from the observation
    const observedImagePath = observation.match(/\(\/images\/.*\.\w*\)/g)[0];

    // Check if the responseMessage already includes the image file path
    if (!responseMessage.text.includes(observedImagePath)) {
      // If the image file path is not found, append the whole observation
      responseMessage.text += '\n' + observation;
      if (this.options.debug) {
        console.debug('added image from intermediateSteps');
      }
    }
  });
}

module.exports = addImages;
