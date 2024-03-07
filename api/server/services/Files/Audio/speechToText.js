const axios = require('axios');
const FormData = require('form-data');
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
    const { endpoint } = req.body;
    const audioFile = req.file;

    if (!audioFile) {
      return res.status(400).json({ message: 'No audio file provided' });
    }

    let text;

    if (endpoint === 'azureOpenAI') {
      const azureConfig = req.app.locals[endpoint];

      const { apiKey, instanceName, whisperModel, apiVersion } = Object.entries(
        azureConfig.groupMap,
      ).reduce((acc, [, value]) => {
        if (acc) {
          return acc;
        }

        const whisperKey = Object.keys(value.models).find((modelKey) =>
          modelKey.startsWith('whisper'),
        );

        if (whisperKey) {
          return {
            apiVersion: value.version,
            apiKey: value.apiKey,
            instanceName: value.instanceName,
            whisperModel: value.models[whisperKey]['deploymentName'],
          };
        }

        return null;
      }, null);

      const baseURL = `https://${instanceName}.openai.azure.com`;

      const url = `${baseURL}/openai/deployments/${whisperModel}/audio/transcriptions?api-version=${apiVersion}`;

      const formData = new FormData();
      formData.append('file', audioFile.buffer, {
        filename: audioFile.originalname,
        contentType: audioFile.mimetype,
        knownLength: audioFile.size,
      });

      const headers = {
        ...formData.getHeaders(),
        'api-key': apiKey,
      };

      const response = await axios.post(url, formData, { headers });

      text = await handleResponse(response);
    } else {
      const formData = new FormData();
      formData.append('file', audioFile.buffer, {
        filename: audioFile.originalname,
        contentType: audioFile.mimetype,
        knownLength: audioFile.size,
      });
      formData.append('model', 'whisper-1');

      const url =
        process.env.URL_OPENAI_TRANSCRIPTIONS || 'https://api.openai.com/v1/audio/transcriptions';

      const headers = {
        ...formData.getHeaders(),
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      };

      const response = await axios.post(url, formData, { headers });

      text = await handleResponse(response);
    }

    res.json({ text });
  } catch (error) {
    logger.error('An error occurred while processing the audio:', error);
    res.sendStatus(500);
  }
}

module.exports = speechToText;
