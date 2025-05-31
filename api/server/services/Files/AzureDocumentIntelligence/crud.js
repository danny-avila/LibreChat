const axios = require('axios');
const fs = require('fs');
const { logger } = require('~/config');

/**
 * Uploads a document to Azure Document Intelligence API and returns the Markdown result.
 *
 * @param {Object} params - The parameters for the Azure Document Intelligence request.
 * @param {string} params.filePath - The path to the file on disk.
 * @param {string} params.apiKey - Azure API key.
 * @param {string} params.endpoint - Azure Document Intelligence endpoint.
 * @param {string} params.modelId - The model ID to use for analysis.
 * @returns {Promise<Object>} - The Document Intelligence result.
 */
async function uploadAzureDocumentIntelligence({ filePath, apiKey, endpoint, modelId }) {
  // Read and encode file
  const fileBuffer = fs.readFileSync(filePath);
  const base64Source = fileBuffer.toString('base64');

  // Build URL (ensure no trailing slash on endpoint)
  const url = `${endpoint.replace(/\/+$/, '')}/documentModels/${modelId}:analyze?outputContentFormat=markdown`;

  try {
    // Kick off the analysis
    const response = await axios.post(
      url,
      { base64Source },
      {
        headers: {
          'Ocp-Apim-Subscription-Key': apiKey,
          'Content-Type': 'application/json',
        },
      },
    );

    // Axios lower-cases header keys, but allow either form
    const headers = response.headers || {};
    const operationLocation = headers['operation-location'] || headers['Operation-Location'];
    if (!operationLocation) {
      throw new Error('Missing Operation-Location header in Azure response.');
    }

    // Poll until done
    let resultContent;
    while (true) {
      const pollResponse = await axios.get(operationLocation, {
        headers: { 'Ocp-Apim-Subscription-Key': apiKey },
      });

      const { status, resultUrl } = pollResponse.data;
      if (status === 'succeeded') {
        const final = await axios.get(resultUrl, {
          headers: { 'Ocp-Apim-Subscription-Key': apiKey },
        });
        resultContent = final.data.analyzeResult.content;
        break;
      }
      if (status === 'failed') {
        throw new Error('Azure Document Intelligence processing failed.');
      }
      // Wait 2s before retry
      await new Promise((r) => setTimeout(r, 2000));
    }

    return resultContent;
  } catch (error) {
    logger.error('Error performing Azure Document Intelligence:', error.message);
    throw error;
  }
}

module.exports = {
  uploadAzureDocumentIntelligence,
};
