const axios = require('axios');
const fs = require('fs');
const { logger } = require('~/config');

/**
 * Uploads a document to Azure Document Intelligence API and processes the result.
 *
 * @param {Object} params - The parameters for the Azure Document Intelligence request.
 * @param {string} params.filePath - The path to the file on disk.
 * @param {string} params.apiKey - Azure API key.
 * @param {string} params.endpoint - Azure Document Intelligence endpoint.
 * @param {string} params.modelId - The model ID to use for analysis.
 * @returns {Promise<Object>} - The Document Intelligence result.
 */
async function uploadAzureDocumentIntelligence({ filePath, apiKey, endpoint, modelId }) {
  const fileBuffer = fs.readFileSync(filePath);
  const base64Source = fileBuffer.toString('base64');

  try {
    const response = await axios.post(
      `${endpoint}/documentModels/${modelId}/analyze?outputContentFormat=markdown`,
      {
        base64Source,
      },
      {
        headers: {
          'Ocp-Apim-Subscription-Key': apiKey,
          'Content-Type': 'application/json',
        },
      },
    );
    const operationLocation = response.headers['Operation-Location'];

    // Polling for the result
    let result;
    while (true) {
      const pollResponse = await axios.get(operationLocation, {
        headers: {
          'Ocp-Apim-Subscription-Key': apiKey,
        },
      });
      if (pollResponse.data.status === 'succeeded') {
        const resultUrl = pollResponse.data.resultUrl; // URL to fetch the analysis result
        const resultResponse = await axios.get(resultUrl, {
          headers: {
            'Ocp-Apim-Subscription-Key': apiKey,
          },
        });
        result = resultResponse.data.analyzeResult.content; // Final analysis result
        break;
      } else if (pollResponse.data.status === 'failed') {
        throw new Error('Azure Document Intelligence processing failed.');
      }
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds before polling again
    }

    return result;
  } catch (error) {
    logger.error('Error performing Azure Document Intelligence:', error.message);
    throw error;
  }
}

module.exports = {
  uploadAzureDocumentIntelligence,
};
