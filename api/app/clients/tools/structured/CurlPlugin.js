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
    this.description_for_model = `Simulates a curl action. Useful for making HTTP requests with various methods and parameters. Accepts an array of commands similar to curl.
    Guidelines:
    - If you don't need all of the webpage tags, exclude them, or choose text only
    - You may always fetch a list of links regardless of the other options
    - You can return markdown if it would be helpful to the user. For example, if they want to see the logo of a website, you can return the markdown for the image.
    - You may also return HTML as an artifact if it would be helpful to the user. For example, if they want to see a portion of the javascript
    - You can fetch all related resources, but do so VERY carefully, it will be a LOT of content!
    - ALWAYS list your sources at the end of the response. If it makes sense to do so, you can also include the source in the response itself. You can do so
    as footnotes or links to the source on the appropriate words. 

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
        .describe(
          'Query parameters to include in the URL as key-value pairs.'
        ),
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
          'Array of HTML tags to exclude from the response body. Example: ["script", "style"].'
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

    // Perform the HTTP request
    const response = await fetch(urlObject.toString(), fetchOptions);

    // Capture response headers
    const responseHeaders = {};
    response.headers.forEach((value, name) => {
      responseHeaders[name] = value;
    });

    let responseBody = await response.text();

    // Load response into Cheerio for parsing
    const $ = cheerio.load(responseBody);

    // Ensure excludeTags is an array
    const excludeTagsArray = Array.isArray(excludeTags) ? excludeTags : [];

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

    // Fetch related resources if requested
    let relatedResources = [];
    if (fetchRelated) {
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
          const resourceResponse = await fetch(absoluteUrl);
          const contentType =
            resourceResponse.headers.get('content-type') || '';
          const isTextType = /^text\/|application\/(javascript|json)/i.test(
            contentType
          );

          if (isTextType) {
            const resourceContent = await resourceResponse.text();
            relatedResources.push({
              url: absoluteUrl,
              contentType,
              content: resourceContent,
            });
          }
        } catch (error) {
          // Ignore errors for individual resources
        }
      }
    }

    // Extract 'a href' targets
    const hrefTargets = $('a[href]')
      .map((i, el) => $(el).attr('href'))
      .get();

    // Build the result object
    const result = {
      requestUrl: urlObject.toString(),
      requestHeaders: fetchOptions.headers,
      ...(fetchOptions.body && { requestBody: fetchOptions.body }),
      responseStatus: response.status,
      responseStatusText: response.statusText,
      responseHeaders: responseHeaders,
      responseBody: responseBody,
      hrefTargets: hrefTargets,
      ...(fetchRelated && { relatedResources }),
    };

    return JSON.stringify(result);
  }
}

module.exports = CurlSimulationTool;
