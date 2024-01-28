const axios = require('axios');
const FormData = require('form-data');

async function speechToTextLocal(req, res) {
  if (!req.file || !req.file.buffer) {
    console.error('No audio file provided in the FormData');
    return res.status(400).json({ message: 'No audio file provided in the FormData' });
  }

  const audioBuffer = req.file.buffer;
  const audioBlob = new Blob([audioBuffer], { type: req.file.mimetype });

  const formData = new FormData();
  formData.append('file', audioBlob);
  formData.append('model', 'whisper-1');

  try {
    // Make the POST request using axios
    const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
      headers: {
        Authorization: `Bearer ${process.env.WHISPER_API_KEY}`,
        'Content-Type': 'multipart/form-data',
      },
    });

    if (response && response.status && response.data && response.data.text) {
      const text = response.data.text.trim();
      res.json({ text });
    }
  } catch (error) {
    console.error(error);
    console.error('Server response:', error.response.data);
    res.status(500).json({ message: 'An error occurred while processing the audio' });
  }
}

module.exports = speechToTextLocal;
