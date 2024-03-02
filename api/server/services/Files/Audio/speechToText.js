const axios = require('axios');
const FormData = require('form-data');
const { Readable } = require('stream');
const { logger } = require('~/config');

async function handleResponse(response) {
  if (response.status !== 200) {
    throw new Error('Invalid response from the STT API');
  }

  if (!response.data || !response.data.text) {
    throw new Error('Missing data in response from the STT API');
  }

  return response.data.text.trim();
}

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

    const text = await handleResponse(response);
    res.json({ text });
  } catch (error) {
    logger.error('An error occurred while processing the audio:', error);
    res.sendStatus(500);
  }
}

module.exports = speechToText;
