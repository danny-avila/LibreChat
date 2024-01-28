const axios = require('axios');
const FormData = require('form-data');
const { Readable } = require('stream');

async function speechToTextLocal(req, res) {
  console.log('Using local API');

  if (!req.file || !req.file.buffer) {
    console.error('No audio file provided in the FormData');
    return res.status(400).json({ message: 'No audio file provided in the FormData' });
  }

  const audioBuffer = req.file.buffer;

  // Create a readable stream from the audio buffer
  const audioReadStream = Readable.from(audioBuffer);
  // Set the filename for mimeType detection
  audioReadStream.path = 'audio.wav';

  const formData = new FormData();
  formData.append('file', audioReadStream, { filename: 'audio.wav', contentType: 'audio/wav' });
  formData.append('model', 'whisper');

  try {
    // Make the POST request using axios
    const response = await axios.post('http://localhost:8080/v1/audio/transcriptions', formData, {
      headers: formData.getHeaders(),
    });

    if (response && response.status && response.data && response.data.text) {
      const text = response.data.text.trim();
      console.log(`Transcribed text: ${text}`);
      res.json({ text });
    }
  } catch (error) {
    console.error(error);
    console.error('Server response:', error.response.data);
    res.status(500).json({ message: 'An error occurred while processing the audio' });
  }
}

module.exports = speechToTextLocal;
