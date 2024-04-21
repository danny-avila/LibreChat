const axios = require('axios').default;
const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { getEnvironmentVariable } = require('@langchain/core/utils/env');
const { JSDOM, VirtualConsole } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const { logger } = require('~/config');
const { ProxyAgent } = require('proxy-agent');

class GoogleSearchResults extends Tool {
  static lc_name() {
    return 'GoogleSearchResults';
  }

  constructor(fields = {}) {
    super(fields);
    this.envVarApiKey = 'GOOGLE_SEARCH_API_KEY';
    this.envVarSearchEngineId = 'GOOGLE_CSE_ID';
    this.override = fields.override ?? false;
    this.apiKey = fields.apiKey ?? getEnvironmentVariable(this.envVarApiKey);
    this.searchEngineId =
      fields.searchEngineId ?? getEnvironmentVariable(this.envVarSearchEngineId);

    this.kwargs = fields?.kwargs ?? {};
    this.name = 'google';
    this.description =
      'A search engine optimized for comprehensive, accurate, and trusted results. Useful for when you need to answer questions about current events.';

    this.schema = z.object({
      query: z.string().min(1).describe('The search query string.'),
      max_results: z
        .number()
        .min(1)
        .max(10)
        .optional()
        .describe('The maximum number of search results to return. Defaults to 10.'),
      // Note: Google API has its own parameters for search customization, adjust as needed.
    });

    // this will get proxy configuration from the standard environment variables
    // https://github.com/TooTallNate/proxy-agents/tree/main/packages/proxy-agent
    this.agent = new ProxyAgent();
  }

  async handleItem(item) {
    // fetch page via URL, then parse into DOM for readability
    // but first setup to ignore jsdom errors, because it often can't parse style sheets
    // see https://stackoverflow.com/a/69958999/532513
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('error', () => {
      // No-op to skip console errors.
    });

    // use axios to fetch page into DOM
    let resp;
    try {
      resp = await axios.get(item.link, { httpAgent: this.agent, httpsAgent: this.agent });
    } catch (error) {
      // handle exception here, else none of the other page fetch data will successfully return
      logger.error(`Error fetching page ${item.link}: ${error} - ${error.response.data}`);
      return null;
    }
    const dom = new JSDOM(resp.data, { virtualConsole }).window.document;

    // parse DOM using Readability
    // title, content, textContent (this is what you want), length (characters), except,
    const article = new Readability(dom).parse();

    // this means Readability could not extract anything
    if (!article) {
      return null;
    }

    // collapse empty lines in textContent, using start of line and end of line anchors
    return `Title: ${item.title}\n\nLink: ${item.link}\n\n${article.textContent.replace(
      /^[\s]*$/gm,
      '',
    )}\n`;
  }

  async _call(input) {
    const validationResult = this.schema.safeParse(input);
    if (!validationResult.success) {
      throw new Error(`Validation failed: ${JSON.stringify(validationResult.error.issues)}`);
    }

    const { query, max_results = 5 } = validationResult.data;

    let response;
    try {
      response = await axios.get(
        `https://www.googleapis.com/customsearch/v1?key=${this.apiKey}&cx=${
          this.searchEngineId
        }&q=${encodeURIComponent(query)}&num=${max_results}`,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );
    } catch (error) {
      // the default axios exception only shows the code
      // here we add the response body, which usually has more information
      throw new Error(
        `Request failed with status ${error.response.status}: ${error.response.data}`,
      );
    }

    // now go through all of the search results, and retrieve the text contents of all search result pages in parallel
    const webPages = (
      await Promise.all(response.data.items.map((item, idx) => this.handleItem(item, idx)))
    )
      // filter to remove any nulls, which are pages that Readability could not parse
      .filter((item) => item !== null)
      // add a correctly numbered heading to each page
      .map((item, idx) => `## Web page ${idx + 1}\n${item}`);

    // truncate each webPage to truncWords words
    const truncWords = 1300;
    const truncWebPages = webPages.map((webPage) => {
      const words = webPage.split(' ');
      if (words.length <= truncWords) {
        return webPage;
      } else {
        return words.slice(0, truncWords).join(' ') + ' ...';
      }
    });

    const res =
      'When writing your response, please cite the web pages inline using "[source N](LINK)" ' +
      'with the number N from the "## Web page N" headings and LINK from the "Link:" at the start of the relevant web page. \n\n' +
      `${truncWebPages.join('\n\n')}`;
    //console.log(res);
    return res;
  }
}

module.exports = GoogleSearchResults;
