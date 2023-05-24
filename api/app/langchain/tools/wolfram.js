/* eslint-disable no-useless-escape */
const axios = require('axios');
const { Tool } = require('langchain/tools');

class WolframAlphaAPI extends Tool {
  constructor(fields) {
    super();
    this.name = 'wolfram';
    this.apiKey = fields.apiKey || this.getAppId();
    this.description = `Access computation, math, curated knowledge & real-time data through wolframAlpha.
- Understands natural language queries about entities in chemistry, physics, geography, history, art, astronomy, and more.
- Performs mathematical calculations, date and unit conversions, formula solving, etc.
General guidelines:
- Make natural-language queries in English; translate non-English queries before sending, then respond in the original language.
- Inform users if information is not from wolfram.
- ALWAYS use this exponent notation: "6*10^14", NEVER "6e14".
- Your input must ONLY be a single-line string.
- ALWAYS use proper Markdown formatting for all math, scientific, and chemical formulas, symbols, etc.:  '$$\n[expression]\n$$' for standalone cases and '\( [expression] \)' when inline.
- Format inline wolfram Language code with Markdown code formatting.
- Convert inputs to simplified keyword queries whenever possible (e.g. convert "how many people live in France" to "France population").
- Use ONLY single-letter variable names, with or without integer subscript (e.g., n, n1, n_1).
- Use named physical constants (e.g., 'speed of light') without numerical substitution.
- Include a space between compound units (e.g., "Ω m" for "ohm*meter").
- To solve for a variable in an equation with units, consider solving a corresponding equation without units; exclude counting units (e.g., books), include genuine units (e.g., kg).
- If data for multiple properties is needed, make separate calls for each property.
- If a wolfram Alpha result is not relevant to the query:
-- If wolfram provides multiple 'Assumptions' for a query, choose the more relevant one(s) without explaining the initial result. If you are unsure, ask the user to choose.
- Performs complex calculations, data analysis, plotting, data import, and information retrieval.`;
    // - Please ensure your input is properly formatted for wolfram Alpha.
    // -- Re-send the exact same 'input' with NO modifications, and add the 'assumption' parameter, formatted as a list, with the relevant values.
    // -- ONLY simplify or rephrase the initial query if a more relevant 'Assumption' or other input suggestions are not provided.
    // -- Do not explain each step unless user input is needed. Proceed directly to making a better input based on the available assumptions.
    // - wolfram Language code is accepted, but accepts only syntactically correct wolfram Language code.
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
    const formattedQuery = query.replaceAll(/\`/g, '');
    const baseURL = 'https://www.wolframalpha.com/api/v1/llm-api';
    const encodedQuery = encodeURIComponent(formattedQuery);
    const appId = this.apiKey || this.getAppId();
    const url = `${baseURL}?input=${encodedQuery}&appid=${appId}`;
    return url;
  }

  async _call(input) {
    try {
      const url = this.createWolframAlphaURL(input);
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
