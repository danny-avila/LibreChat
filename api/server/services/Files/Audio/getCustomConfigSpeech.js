const getCustomConfig = require('~/server/services/Config/getCustomConfig');
const { logger } = require('~/config');

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

    if (!customConfig) {
      return res.status(200).send({
        message: 'No custom configuration found',
      });
    }

    const sttExternal = !!customConfig.speech?.stt;
    const ttsExternal = !!customConfig.speech?.tts;
    let settings = {
      sttExternal,
      ttsExternal,
    };

    if (!customConfig.speech?.speechTab) {
      return res.status(200).send(settings);
    }

    const speechTab = customConfig.speech.speechTab;

    if (speechTab.advancedMode !== undefined) {
      settings.advancedMode = speechTab.advancedMode;
    }

    if (speechTab.speechToText) {
      for (const key in speechTab.speechToText) {
        if (speechTab.speechToText[key] !== undefined) {
          settings[key] = speechTab.speechToText[key];
        }
      }
    }

    if (speechTab.textToSpeech) {
      for (const key in speechTab.textToSpeech) {
        if (speechTab.textToSpeech[key] !== undefined) {
          settings[key] = speechTab.textToSpeech[key];
        }
      }
    }

    return res.status(200).send(settings);
  } catch (error) {
    logger.error('Failed to get custom config speech settings:', error);
    res.status(500).send('Internal Server Error');
  }
}

module.exports = getCustomConfigSpeech;
