const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const fetch = require('node-fetch');
const { URL, URLSearchParams } = require('url');
const cheerio = require('cheerio');

class CurlSimulationTool extends Tool {
  constructor(fields = {}) {
    super();

    this.name = 'CurlPlugin';
    this.description =
      'Simulates a curl action. Useful for making HTTP requests with various methods and parameters. Accepts an array of commands similar to curl.';
    this.description_for_model = `Simulates a curl action by making HTTP requests with various methods and parameters. Accepts input similar to curl commands.

Guidelines:
- **Default Behavior:** By default, the response will exclude \`<style>\` and \`<script>\` tags, as well as links to JavaScript and CSS files.
- Use \`excludeTags\` to specify additional HTML tags to exclude from the response.
- Use \`returnOnlyTags\` to include only certain HTML tags in the response.
- If you want to retrieve only the text content without any HTML markup, set \`returnTextOnly\` to true.
- Set \`fetchRelated\` to true to fetch related resources (like CSS or JavaScript files). Be cautious, as this can return a lot of content.
- To include a list of hyperlinks (\`hrefTargets\`) found in the response body, set \`includeHrefTargets\` to true.
- You can return content in markdown or HTML format if it would be helpful to the user. For example, if they want to see the logo of a website, you can return the markdown for the image.
- You may also return HTML as an artifact if it would be helpful to the user. For example, if they want to see a portion of the JavaScript.
- **Caution:** When fetching related resources, do so very carefully to avoid overwhelming the response with data.
- **Sources:** Always list your sources at the end of the response. Include sources as footnotes or inline links where appropriate.
`;

    this.schema = z.object({
      method: z
        .enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
        .optional()
        .describe('HTTP method to use for the request. Defaults to GET.'),
      url: z
        .string()
        .url()
        .describe('The URL to which the request is sent.'),
      headers: z
        .record(z.string())
        .optional()
        .describe('Headers to include in the request as key-value pairs.'),
      params: z
        .record(z.string())
        .optional()
        .describe('Query parameters to include in the URL as key-value pairs.'),
      data: z
        .any()
        .optional()
        .describe(
          'Body data to include in the request. Can be a string or object.'
        ),
      cookies: z
        .string()
        .optional()
        .describe('Cookies to include in the request, formatted as a string.'),
      returnOnlyTags: z
        .array(z.string())
        .optional()
        .describe(
          'Array of HTML tags to include in the response body. Example: ["div", "span", "a"].'
        ),
      excludeTags: z
        .array(z.string())
        .optional()
        .describe(
          'Array of HTML tags to exclude from the response body. Defaults to ["style", "script", "link[rel=\'stylesheet\']", "link[rel=\'javascript\']"].'
        ),
      returnTextOnly: z
        .boolean()
        .optional()
        .describe(
          'If true, returns only the text content without any HTML tags.'
        ),
      fetchRelated: z
        .boolean()
        .optional()
        .describe(
          'If true, fetches related non-binary links (HTML, CSS, JavaScript) and includes them in the response.'
        ),
      includeHrefTargets: z
        .boolean()
        .optional()
        .describe(
          'If true, includes a list of href targets extracted from the response body.'
        ),
    });
  }

  async _call(input) {
    const {
      method = 'GET',
      url,
      headers = {},
      params = {},
      data,
      cookies,
      returnOnlyTags,
      excludeTags,
      returnTextOnly = false,
      fetchRelated = false,
      includeHrefTargets = false,
      ...rest
    } = input;

    // Validate URL
    if (!url) {
      throw new Error('URL is required.');
    }

    // Build the full URL with query parameters
    const urlObject = new URL(url);
    if (params && Object.keys(params).length > 0) {
      urlObject.search = new URLSearchParams(params).toString();
    }

    // Prepare fetch options
    const fetchOptions = {
      method: method.toUpperCase(),
      headers: { ...headers },
    };

    // Add cookies to headers if provided
    if (cookies) {
      fetchOptions.headers['Cookie'] = cookies;
    }

    // Include body data if applicable
    if (['POST', 'PUT', 'PATCH'].includes(fetchOptions.method) && data) {
      fetchOptions.body =
        typeof data === 'string' ? data : JSON.stringify(data);
      fetchOptions.headers['Content-Type'] =
        fetchOptions.headers['Content-Type'] || 'application/json';
    }

    // Default excludeTags if not provided
    const defaultExcludeTags = [
      'style',
      'script',
      'link[rel="stylesheet"]',
      'link[rel="javascript"]',
    ];
    const excludeTagsArray = Array.isArray(excludeTags)
      ? excludeTags
      : defaultExcludeTags;

    // Helper function to process a request and return result object
    const processRequest = async (requestUrl) => {
      const response = await fetch(requestUrl, fetchOptions);

      // Capture response headers
      const responseHeaders = {};
      response.headers.forEach((value, name) => {
        responseHeaders[name] = value;
      });

      let responseBody = await response.text();

      // Load response into Cheerio for parsing
      const $ = cheerio.load(responseBody);

      // Exclude specified tags
      if (excludeTagsArray.length > 0) {
        excludeTagsArray.forEach((tag) => {
          $(tag).remove();
        });
      }

      // Ensure returnOnlyTags is an array
      const returnOnlyTagsArray = Array.isArray(returnOnlyTags)
        ? returnOnlyTags
        : [];

      // Include only specified tags
      if (returnOnlyTagsArray.length > 0) {
        responseBody = $(returnOnlyTagsArray.join(',')).toString();
      } else if (excludeTagsArray.length > 0) {
        responseBody = $.html();
      }

      // Return text only
      if (returnTextOnly) {
        responseBody = $.root().text();
      }

      // Extract 'a href' targets if requested
      let hrefTargets = [];
      if (includeHrefTargets) {
        hrefTargets = $('a[href]')
          .map((i, el) => $(el).attr('href'))
          .get();
      }

      // Build the result object
      const result = {
        requestUrl: requestUrl,
        requestHeaders: fetchOptions.headers,
        ...(fetchOptions.body && { requestBody: fetchOptions.body }),
        responseStatus: response.status,
        responseStatusText: response.statusText,
        responseHeaders: responseHeaders,
        responseBody: responseBody,
        ...(hrefTargets.length > 0 && { hrefTargets }),
      };

      return result;
    };

    // Process the main request
    const mainResult = await processRequest(urlObject.toString());

    // Fetch related resources if requested
    let relatedResources = [];
    if (fetchRelated) {
      // Load main response body into Cheerio
      const $ = cheerio.load(mainResult.responseBody);

      const resourceLinks = $('a[href], link[href], script[src]')
        .map((i, el) => $(el).attr('href') || $(el).attr('src'))
        .get()
        .filter(
          (href) =>
            href &&
            !href.startsWith('mailto:') &&
            !href.startsWith('tel:') &&
            !/\.(png|jpg|jpeg|gif|bmp|tiff|ico|svg|pdf)$/i.test(href)
        );

      for (const link of resourceLinks) {
        try {
          const absoluteUrl = new URL(link, urlObject).toString();
          const resourceResult = await processRequest(absoluteUrl);
          relatedResources.push(resourceResult);
        } catch (error) {
          // Ignore errors for individual resources
        }
      }
    }

    // Include related resources in the final result
    const finalResult = {
      ...mainResult,
      ...(fetchRelated && { relatedResources }),
    };

    return JSON.stringify(finalResult);
  }
}

module.exports = CurlSimulationTool;
