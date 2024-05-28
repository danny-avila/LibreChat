/* eslint-disable no-useless-escape */
const axios = require('axios');
const { z } = require('zod');
const { StructuredTool } = require('langchain/tools');
const { logger } = require('~/config');
const { forEach } = require('lodash');

class DrupalFAAPI extends StructuredTool {
  constructor(fields) {
    super();

    /* Used to initialize the Tool without necessary variables. */
    this.override = fields.override ?? false;
    
    this.name = 'drupal_fa_api';

    this.apiKey = this.getApiKey();
    this.apiBaseURL = this.getBaseUrl();

    this.description_for_model = `Give a prompt for another assistant to retrieve the query string. For example, "Find the latest articles about climate change."`;

    this.description = `A tool for querying the Drupal FA API. The input should be a prompt for the assistant to retrieve the query string. The output will be the raw text response from the API.`;

    this.openaiApiKey = this.getOpenAiApiKey();
    this.agentAssistantId = this.getAgentAssistantId();

    this.description_for_model_OLD = `// Access and retrieve Drupal content using the JSON:API module.
    // The JSON:API module provides a standardized way to interact with Drupal entities via RESTful web services.
    // General guidelines:
    // - Use GET requests to retrieve entities, collections, and related resources from Drupal.
    // - Use node_type--node_type to find the bundle for a specific content type, if the bundle you tried is not right. The endpoint is /jsonapi/node_type/node_type.
    // - Utilize filtering to limit the data returned in collections to only the entities you need (e.g., by content type, fields, etc.).
    // - Use includes to embed related resource objects within a single response, reducing the need for multiple HTTP requests.
    // - Apply pagination to handle large collections by splitting the response into multiple pages using page[offset] and page[limit] parameters.
    // - Implement sorting to order the results based on specified fields using the sort parameter.
    // - Handle errors gracefully, providing informative messages for debugging purposes.
    // - Follow the JSON:API specification strictly to structure requests and responses properly.
    // - Ensure the schema for each request aligns with the expected format for the corresponding Drupal entity.
    // - Utilize proper JSON formatting for all requests and responses to maintain compliance with JSON:API standards.
    // - Structure for GET requests:
    //   - Fetching a collection of entities: /jsonapi/{entity_type}/{bundle}
    //   - Fetching a specific entity by UUID: /jsonapi/{entity_type}/{bundle}/{uuid}
    // - Examples:
    //   - Fetching node types:
    //     - GET /jsonapi/node_type/node_type - Retrieve a collection of node types.
    //   - Fetching nodes:
    //     - GET /jsonapi/node/articolo - Retrieve a collection of articolo nodes.
    //     - GET /jsonapi/node/articolo/{uuid} - Retrieve a specific articolo node by UUID.
    //   - Filtering:
    //     - GET /jsonapi/node/articolo?filter[status]=1 - Retrieve only published articles.
    //     - GET /jsonapi/node/articolo?filter[title][value]=Sample&filter[title][operator]=CONTAINS - Retrieve articles with "Sample" in the title.
    //   - Includes:
    //     - GET /jsonapi/node/articolo?include=field_author - Retrieve articles along with their author information.
    //   - Pagination:
    //     - GET /jsonapi/node/articolo?page[offset]=0&page[limit]=10 - Retrieve the first 10 articles.
    //   - Sorting:
    //     - GET /jsonapi/node/articolo?sort=-created - Retrieve articles sorted by creation date in descending order.`;

    this.description_OLD = `Drupal JSON:API offers a standardized way to retrieve Drupal content via RESTful web services, supporting entity retrieval, filtering, including related resources, pagination and sorting.`;
    
    this.schema = z.object({
      input: z.string().describe('Natural language query to Drupal following the guidelines'),
    });

  }

  async fetchRawText(url) {
    try {
      const response = await axios.get(url, { responseType: 'text' });
      return response.data;
    } catch (error) {
      logger.error('[DrupalFAAPI] Error fetching raw text:', error);
      throw error;
    }
  }

  getApiKey() {
    const apiKey = process.env.DRUPAL_FA_API_KEY || '';
    if (!apiKey) {
      throw new Error('Missing DRUPAL_FA_API_KEY environment variable.');
    }
    return apiKey;
  }

  getOpenAiApiKey() {
    const openaiApiKey = process.env.OPENAI_API_KEY || '';
    if (!openaiApiKey) {
      throw new Error('Missing OPENAI_API_KEY environment variable.');
    }
    return openaiApiKey;
  }

  getAgentAssistantId() {
    const assistantId = process.env.DRUPAL_AGENT_ASSISTANT_ID || '';
    if (!assistantId) {
      throw new Error('Missing DRUPAL_AGENT_ASSISTANT_ID environment variable.');
    }
    return assistantId;
  }

  getBaseUrl() {
    const baseUrl = process.env.DRUPAL_FA_API_BASE_URL || '';
    if (!baseUrl) {
      throw new Error('Missing DRUPAL_FA_API_BASE_URL environment variable.');
    }
    return baseUrl;
  }

  async createDrupalURL(prompt) {
    try {
      const threadId = await this.createThread();
      await this.addMessageToThread(threadId, prompt);
      const runId = await this.runAssistant(threadId);
      const endpoints = await this.getAssistantResponse(threadId, runId);

      // Test the endpoints and find the first with response 200
      let endpoint = '';

      for (const endpoint of endpoints) {
        const url = `${this.apiBaseURL}${endpoint}`;
        try {
          const response = await axios.get(url);
          if (response.status === 200) {
            endpoint = url;
            break;
          }
        } catch (error) {
          logger.error(`[DrupalFAAPI] Error testing endpoint ${url}:`, error);
        }
      }

      if (!endpoint) {
        throw new Error('No endpoint with response 200 found.');
      }

      return endpoint;

    } catch (error) {
      logger.error('[DrupalFAAPI] Error creating Drupal URL:', error);
      throw error;
    }
  }

  async createThread() {
    const response = await axios.post('https://api.openai.com/v1/threads', {}, {
      headers: {
        'Authorization': `Bearer ${this.openaiApiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2',
      },
    });
    return response.data.id;
  }

  async addMessageToThread(threadId, content) {
    await axios.post(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      role: 'user',
      content: content,
    }, {
      headers: {
        'Authorization': `Bearer ${this.openaiApiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2',
      },
    });
  }

  async runAssistant(threadId) {
    const response = await axios.post(`https://api.openai.com/v1/threads/${threadId}/runs`, {
      assistant_id: this.agentAssistantId,
    }, {
      headers: {
        'Authorization': `Bearer ${this.openaiApiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2',
      },
    });
    return response.data.id;
  }

  async getAssistantResponse(threadId, runId) {
    const response = await axios.get(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}/steps`, {
      headers: {
        'Authorization': `Bearer ${this.openaiApiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2',
      },
    });
    const messages = response.data.data;
    for (const message of messages) {
      if (message.type === 'message_creation' && message.role === 'assistant') {
        return JSON.parse(message.content[0].text).endpoints;
      }
    }
    throw new Error('No endpoints found in assistant response.');
  }

  // createDrupalJSONAPIURL(data) {
  //   const { entity_type, bundle, uuid, filter, include, sort, page } = data;
  //   let url = `${process.env.DRUPAL_FA_API_BASE_URL}/jsonapi/${entity_type}/${bundle}`;
  //   if (uuid) {
  //     url += `/${uuid}`;
  //   }
  //   const params = new URLSearchParams();
  //   if (this.apiKey) {
  //     params.append('api_key', this.apiKey);
  //   }
  //   if (filter) {
  //     params.append('filter', filter);
  //   }
  //   if (include) {
  //     params.append('include', include);
  //   }
  //   if (sort) {
  //     params.append('sort', sort);
  //   }
  //   if (page) {
  //     if (page.offset !== undefined) {
  //       params.append('page[offset]', page.offset);
  //     }
  //     if (page.limit !== undefined) {
  //       params.append('page[limit]', page.limit);
  //     }
  //   }

  //   if (params.toString()) {
  //     url += `?${params.toString()}`;
  //   }
  //   return url;
  // }

  async _call(input) {
    try {
      const url = this.createDrupalURL(input);
      logger.info(`[DrupalFAAPI] Querying Drupal FA: ${url}`);
      const response = await this.fetchRawText(url);
      return response;
    } catch (error) {
      if (error.response && error.response.data) {
        logger.error('[DrupalFAAPI] Error data:', error);
        return error.response.data;
      } else {
        logger.error('[DrupalFAAPI] Error querying Drupal FA', error);
        return 'There was an error querying Drupal FA.';
      }
    }
  }

}

module.exports = DrupalFAAPI;