/* eslint-disable no-useless-escape */
const axios = require('axios');
const { StructuredTool } = require('langchain/tools');
const { z } = require('zod');

class WolframAlphaAPI extends StructuredTool {
  constructor(fields) {
    super();
    this.name = 'wolfram';
    this.apiKey = fields.WOLFRAM_APP_ID || this.getAppId();
    this.description = `WolframAlpha offers computation, math, curated knowledge, and real-time data. It handles natural language queries and performs complex calculations. 
Guidelines include:
- Use English for queries and inform users if information isn't from Wolfram.
- Use "6*10^14" for exponent notation and single-line strings for input.
- Use Markdown for formulas and simplify queries to keywords.
- Use single-letter variable names and named physical constants.
- Include a space between compound units and consider equations without units when solving.
- Make separate calls for each property and choose relevant 'Assumptions' if results aren't relevant.
- The tool also performs data analysis, plotting, and information retrieval.`;
    this.schema = z.object({
      nl_query: z.string().describe("Natural language query to WolframAlpha following the guidelines"),
    });
  }

  async fetchRawText(url) {
    try {
      const response = await axios.get(url, { responseType: 'text' });
      return response.data;
    } catch (error) {
      console.error(`Error fetching raw text: ${error}`);
      throw error;
    }
  }

  getAppId() {
    const appId = process.env.WOLFRAM_APP_ID || '';
    if (!appId) {
      throw new Error('Missing WOLFRAM_APP_ID environment variable.');
    }
    return appId;
  }

  createWolframAlphaURL(query) {
    // Clean up query
    const formattedQuery = query.replaceAll(/`/g, '').replaceAll(/\n/g, ' ');
    const baseURL = 'https://www.wolframalpha.com/api/v1/llm-api';
    const encodedQuery = encodeURIComponent(formattedQuery);
    const appId = this.apiKey || this.getAppId();
    const url = `${baseURL}?input=${encodedQuery}&appid=${appId}`;
    return url;
  }

  async _call(data) {
    try {
      const { nl_query } = data;
      const url = this.createWolframAlphaURL(nl_query);
      const response = await this.fetchRawText(url);
      return response;
    } catch (error) {
      if (error.response && error.response.data) {
        console.log('Error data:', error.response.data);
        return error.response.data;
      } else {
        console.log(`Error querying Wolfram Alpha`, error.message);
        // throw error;
        return 'There was an error querying Wolfram Alpha.';
      }
    }
  }
}

module.exports = WolframAlphaAPI;
