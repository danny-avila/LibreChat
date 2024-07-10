const getCustomConfig = require('~/server/services/Config/getCustomConfig');

/**
 * This function retrieves the speechTab settings from the custom configuration
 * It first fetches the custom configuration
 * Then, it checks if the custom configuration and the speechTab schema exist
 * If they do, it sends the speechTab settings as a JSON response
 * If they don't, it throws an error
 *
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 * @returns {Promise<void>}
 * @throws {Error} - If the custom configuration or the speechTab schema is missing, an error is thrown
 */
async function getCustomConfigSpeech(req, res) {
  try {
    const customConfig = await getCustomConfig();

    if (!customConfig || !customConfig.speech?.speechTab) {
      throw new Error('Configuration or speechTab schema is missing');
    }

    const ttsSchema = customConfig.speech?.speechTab;
    let settings = {};

    if (ttsSchema.advancedMode !== undefined) {
      settings.advancedMode = ttsSchema.advancedMode;
    }

    if (ttsSchema.speechToText) {
      for (const key in ttsSchema.speechToText) {
        if (ttsSchema.speechToText[key] !== undefined) {
          settings[key] = ttsSchema.speechToText[key];
        }
      }
    }

    if (ttsSchema.textToSpeech) {
      for (const key in ttsSchema.textToSpeech) {
        if (ttsSchema.textToSpeech[key] !== undefined) {
          settings[key] = ttsSchema.textToSpeech[key];
        }
      }
    }

    return res.status(200).send(settings);
  } catch (error) {
    res.status(200).send();
  }
}

module.exports = getCustomConfigSpeech;
