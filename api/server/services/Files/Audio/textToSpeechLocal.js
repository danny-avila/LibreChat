const axios = require('axios');
const fs = require('fs');

async function textToSpeechLocal(req, res) {
  let text = req.body.text;

  console.log('text', text);

  const url = 'https://api.elevenlabs.io/v1/text-to-speech/zvBAbtHEaG9XNBKqbWMi';
  const headers = {
    Accept: 'audio/mpeg',
    'Content-Type': 'application/json',
    'xi-api-key': process.env.ELEVENLABS_API_KEY,
  };
  const data = {
    text: text,
    model_id: 'eleven_monolingual_v1',
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.5,
    },
  };

  try {
    console.log('Sending request');
    const response = await axios.post(url, data, { headers, responseType: 'stream' });
    console.log('Request sent');
    const writer = fs.createWriteStream('output.mp3');
    console.log('Creating writer');
    response.data.pipe(writer);
    console.log('Piping data');
    console.log(response.data);
    writer.on('finish', () => {
      res.send('File saved successfully');
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred');
  }
}

module.exports = textToSpeechLocal;
