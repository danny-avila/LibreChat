const axios = require('axios').default;

const { z } = require('zod');
const { StructuredTool } = require('@langchain/core/tools');
const { logger } = require('~/config');

class ExternalFA extends StructuredTool {
  constructor(fields) {
    super();
    this.override = fields.override ?? false;

    this.flowiseApiKey = this.getEnvVariable('FLOWISE_API_KEY');

    this.schema = z.object({
      original_prompt: z.string().describe('Il testo della domanda così come viene scritta dall\'utente.'),
      context: z.string().describe('Contesto ricavato dall\'assistente per la domanda originale. Conciso ed efficace, fornendo informazioni necessarie per comprendere la domanda.'),
      data_requested: z.string().describe('Specifica i dati necessari richiesti all\'API per rispondere efficacemente alla domanda originale dell\'utente.'),
    });
  }

  async fetchRawTextFromFlowise(url, method = 'POST', input) {

    logger.info(`[ExternalFAAPI] API: Bearer ${this.flowiseApiKey}`);

    var options = {
      method: method,
      url: url,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.flowiseApiKey}`
      },
      data: {question: JSON.stringify(input)}
    };

    try {
      logger.info(`[ExternalFAAPI] Fetching data from Flowise: ${url}`);
      const response = await axios(options);
      // Check if the response is valid and a string
      if (!response.data || typeof response.data.text !== 'string') {
        throw new Error('Invalid response from Flowise');
      }
      return response.data.text;
    } catch (error) {
      if (error.response) {
        logger.error(`[ExternalFAAPI] Error response: ${error.response}`);
      } else if (error.request) {
        logger.error(`[ExternalFAAPI] No response received:, ${error.request}`);
      } else {
        logger.error(`[ExternalFAAPI] Error setting up request: ${error.message}`);
      }
      throw error;
    }

  }

  getEnvVariable(varName) {
    const value = process.env[varName];
    if (!value) {
      throw new Error(`Missing ${varName} environment variable.`);
    }
    return value;
  }

  async _callOld(input) {
    try {

      let url = `https://flows.cleversoft.it/api/v1/prediction/${this.predictionId}`;

      logger.info(`[ExternalFAAPI] Querying Flowise: ${url}`);

      const responseText = await this.fetchRawTextFromFlowise(url, 'POST', input);
      return responseText;

    } catch (error) {
      if (error.response && error.response.data) {
        logger.error('[ExternalFAAPI] Error data:', error);
        return error.response.data;
      } else {
        logger.error('[ExternalFAAPI] Error querying External FA', error);
        return 'There was an error querying External FA.';
      }
    }
  }


  // eslint-disable-next-line no-unused-vars
  async _call(query, _runManager) {
  //  async _call({ query }, _runManager) {

  logger.info(`[ExternalFAAPI] Query: ${JSON.stringify(query)}`);

    // Create a formatted string that concatenates all the query objects
    let questionString = '';
    for (const key in query) {
      questionString += `${key}: \n${query[key]}\n\n`;
    }

    const body = { question: questionString }

    let url = `https://flows.cleversoft.it/api/v1/prediction/${this.predictionId}`;
    logger.info(`[ExternalFAAPI] Querying Flowise: ${url}`);
    logger.info(`[ExternalFAAPI] Body: ${JSON.stringify(body)}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.flowiseApiKey}`
        },
        // body: JSON.stringify({ ...body }),
        body: JSON.stringify(body)
      });

      const result = await response.text();

      logger.info(`[ExternalFAAPI] Response: ${result}`);

      const json = JSON.parse(result);

      const noResponse = '[ExternalFAAPI] No response found in Vtiger API results';

      if (!result || !json || !json.text) {
        return noResponse;
      }

      return json.text;

    } catch (error) {
      logger.error('[ExternalFAAPI] API request failed', error);
      return `[ExternalFAAPI] API request failed: ${error.message}`;
    }
  }



}

module.exports = ExternalFA;
