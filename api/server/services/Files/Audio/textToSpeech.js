const axios = require('axios');

async function textToSpeech(req, res) {
  const { text } = req.body;
  if (!text) {
    return res.status(400).send('Missing text in request body');
  }

  const url = process.env.TTS_REVERSE_PROXY;
  const headers = {
    Accept: 'audio/mpeg',
    'Content-Type': 'application/json',
    'xi-api-key': process.env.TTS_API_KEY,
  };
  const data = {
    text,
    model_id: 'eleven_monolingual_v1',
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.5,
    },
  };

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
