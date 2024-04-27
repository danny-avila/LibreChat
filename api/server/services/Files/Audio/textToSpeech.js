const axios = require('axios');
const getCustomConfig = require('~/server/services/Config/getCustomConfig');
const { extractEnvVariable } = require('librechat-data-provider');

async function textToSpeech(req, res) {
  const { input } = req.body;
  if (!input) {
    return res.status(400).send('Missing text in request body');
  }

  const customConfig = await getCustomConfig();
  if (!customConfig) {
    res.status(500).send('Custom config not found');
  }

  const resolvedApiKey = extractEnvVariable(customConfig?.tts?.apiKey);

  const url = customConfig.tts?.url || 'https://api.openai.com/v1/audio/speech';

  const headers = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + resolvedApiKey,
  };

  const data = {
    input,
    model: customConfig.tts?.model,
    voice: customConfig.tts?.voice,
    backend: customConfig.tts?.backend,
  };

  if (customConfig.tts.voice === undefined) {
    delete data['voice'];
  }

  if (customConfig.tts.backend === undefined) {
    delete data['backend'];
  }

  if (customConfig.tts.compatibility === 'elevenlabs') {
    delete headers['Authorization'];
    delete data['model'];
    delete data['voice'];
    delete data['input'];
    headers['xi-api-key'] = resolvedApiKey;
    headers['Accept'] = 'audio/mpeg';
    data['model_id'] = customConfig.tts?.model;
    data['text'] = input;
    if (customConfig.tts.voice_settings) {
      data['voice_settings'] = {
        similarity_boost: customConfig.tts.voice_settings.similarity_boost,
        stability: customConfig.tts.voice_settings.stability,
        style: customConfig.tts.voice_settings.style,
        use_speaker_boost: customConfig.tts.voice_settings.use_speaker_boost || false,
      };
    }
    if (customConfig.tts.pronunciation_dictionary_locators) {
      data['pronunciation_dictionary_locators'] =
        customConfig.tts?.pronunciation_dictionary_locators;
    }
  }

  try {
    const response = await axios.post(url, data, { headers, responseType: 'arraybuffer' });
    const audioData = response.data;

    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(audioData);
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred');
  }
}

module.exports = textToSpeech;
