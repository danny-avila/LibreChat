/* eslint-disable no-useless-escape */
const axios = require('axios');
const { StructuredTool } = require('langchain/tools');
const { z } = require('zod');

class LinkReaderAPI extends StructuredTool {
  constructor() {
    super();
    this.name = 'link reader';
    this.description = 'A plugin that allows users to input any url, gets content from it, including webpage, youtube, PDF, PPT, image, word, pages, numbers, excels, google drive etc. It searches up-to-date info in google.';
    this.schema = z.object({
      input: z.string().describe('The url to get the content from'),
    });
  }

  createLinkReaderURL(query) {
    const baseURL = 'https://gochitchat.ai/linkreader/api/get';
    const encodedQuery = encodeURIComponent(query);
    const url = `${baseURL}?url=${encodedQuery}`;
    return url;
  }

  async fetchRawText(url) {
    try {
      const response = await axios.get(url, { responseType: 'json' });
      return response.data;
    } catch (error) {
      console.error(`Error fetching raw text: ${error}`);
      throw error;
    }
  }

  async _call(data) {
    try {
      const { input } = data;
      const url = this.createLinkReaderURL(input);
      const response = await this.fetchRawText(url);
      return response;
    } catch (error) {
      if (error.response && error.response.data) {
        console.log('Error data:', error.response.data);
        return error.response.data;
      } else {
        console.log('Error querying Link Reader', error.message);
        // throw error;
        return 'There was an error querying Link Reader.';
      }
    }
  }
}

module.exports = LinkReaderAPI;
