const axios = require('axios');
const { logger } = require('@librechat/data-schemas');

async function callN8nWebhook(userQuery) {
  try {
    const webhookUrl = 'http://localhost:5678/webhook-test/hello';
    
    logger.debug('[N8nService] Calling n8n webhook with query:', userQuery);
    
    const response = await axios.post(webhookUrl, {
      user_query: userQuery
    }, {
      timeout: 120000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    // Parse the n8n response properly
    let responseText;
    
    logger.debug('[N8nService] Raw response data:', JSON.stringify(response.data, null, 2));
    
    if (typeof response.data === 'string') {
      responseText = response.data;
    } else if (response.data.output) {
      // Direct output field
      responseText = response.data.output;
    } else if (response.data.response) {
      // Parse the nested JSON string in response.response
      try {
        const parsedResponse = JSON.parse(response.data.response);
        responseText = parsedResponse.output || parsedResponse.message || parsedResponse.result || response.data.response;
      } catch (e) {
        // If parsing fails, use the raw response
        responseText = response.data.response;
      }
    } else {
      responseText = response.data.message || response.data.result || JSON.stringify(response.data);
    }
    
    // Clean up the text: replace \n with actual newlines
    if (typeof responseText === 'string') {
      responseText = responseText.replace(/\\n/g, '\n');
    }
    
    logger.debug('[N8nService] Processed response text:', responseText);
    
    return responseText;
  } catch (error) {
    logger.error('[N8nService] Error calling n8n webhook:', error.message);
    throw new Error(`n8n workflow failed: ${error.message}`);
  }
}

module.exports = { callN8nWebhook };