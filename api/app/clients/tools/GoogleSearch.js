const { Tool } = require('langchain/tools');
const { google } = require('googleapis');
const { pipeline } = require('stream');
const { promisify } = require('util');

class GoogleSearchAPI extends Tool {
  constructor(fields = {}) {
    super();
    this.cx = fields.GOOGLE_CSE_ID || this.getCx();
    this.apiKey = fields.GOOGLE_API_KEY || this.getApiKey();
    this.customSearch = undefined;
  }

  name = 'google';

  description =
    'Use the \'google\' tool to retrieve internet search results relevant to your input. The results will return links and snippets of text from the webpages';

  getCx() {
    const cx = process.env.GOOGLE_CSE_ID || '';
    if (!cx) {
      throw new Error('Missing GOOGLE_CSE_ID environment variable.');
    }
    return cx;
  }

  getApiKey() {
    const apiKey = process.env.GOOGLE_API_KEY || '';
    if (!apiKey) {
      throw new Error('Missing GOOGLE_API_KEY environment variable.');
    }
    return apiKey;
  }

  getCustomSearch() {
    if (!this.customSearch) {
      const version = 'v1';
      this.customSearch = google.customsearch(version);
    }
    return this.customSearch;
  }

  resultsToReadableFormat(results) {
    let output = 'Results:\n';

    results.forEach((resultObj, index) => {
      output += `Title: ${resultObj.title}\n`;
      output += `Link: ${resultObj.link}\n`;

      if (resultObj.snippet) {
        output += `Snippet: ${resultObj.snippet}\n`;
      }

      if (index < results.length - 1) {
        output += '\n';
      }
    });

    return output;
  }

  async summarizeResults(results) {
    const snippets = results.map(result => result.snippet);
    const concatenatedSnippets = snippets.join('\n');

    const summarizer = pipeline("summarization", { model: "facebook/bart-large-cnn" });
    const summarize = promisify(summarizer);

    try {
      const summary = await summarize(concatenatedSnippets, { max_length: 150, min_length: 40, do_sample: false });
      return summary[0].summary_text;
    } catch (error) {
      console.log(`Error summarizing search results: ${error}`);
      return 'There was an error summarizing the search results.';
    }
  }

  async _call(input, numResults = 10) {
    try {
      const response = await this.getCustomSearch().cse.list({
        q: input,
        cx: this.cx,
        auth: this.apiKey,
        num: numResults, // Retrieve more results
      });

      if (!response.data.items || response.data.items.length === 0) {
        return 'No good Google Search Result was found';
      }

      const results = response.data.items.slice(0, numResults);

      const summary = await this.summarizeResults(results);

      return summary;
    } catch (error) {
      console.log(`Error searching Google: ${error}`);
      return 'There was an error searching Google.';
    }
  }
}

module.exports = GoogleSearchAPI;
