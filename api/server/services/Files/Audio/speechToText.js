const axios = require('axios');
const FormData = require('form-data');
const { Readable } = require('stream');

async function speechToText(req, res) {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ message: 'No audio file provided in the FormData' });
    }

    const audioBuffer = req.file.buffer;

    // Create a readable stream from the audio buffer for efficient handling
    const audioReadStream = Readable.from(audioBuffer);
    audioReadStream.path = 'audio.wav'; // Set filename for potential mimeType detection

    const formData = new FormData();

    // Prioritize using a readable stream for flexibility:
    formData.append('file', audioReadStream, { filename: 'audio.wav', contentType: 'audio/wav' });

    // Fall back to using a Blob if necessary:
    if (!Readable.from) {
      // If Readable.from is not supported
      const audioBlob = new Blob([audioBuffer], { type: req.file.mimetype });
      formData.append('file', audioBlob);
    }

    formData.append('model', 'whisper');

    const url = process.env.STT_REVERSE_PROXY || 'https://api.openai.com/v1/audio/transcriptions';

    const response = await axios.post(url, formData, {
      headers: formData.getHeaders(),
      auth: {
        username: process.env.STT_API_KEY,
      },
    });

    if (response && response.status && response.data && response.data.text) {
      const text = response.data.text.trim();
      res.json({ text });
    } else {
      throw new Error('Invalid response from server');
    }
  } catch (error) {
    console.error('Server response:', error.response?.data);
    res.status(500).json({ message: 'An error occurred while processing the audio' });
  }
}

module.exports = speechToText;
