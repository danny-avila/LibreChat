const { Tool } = require('langchain/tools');

// class RequestsGetTool extends Tool {
//   constructor(headers = {}, { maxOutputLength } = {}) {
//     super();
//     this.name = 'requests_get';
//     this.headers = headers;
//     this.maxOutputLength = maxOutputLength || 2000;
//     this.description = `A portal to the internet. Use this when you need to get specific content from a website.
//  - Input should be a  url (i.e. https://www.google.com). The output will be the text response of the GET request.`;
//   }

//   async _call(input) {
//     const res = await fetch(input, {
//       headers: this.headers
//     });
//     const text = await res.text();
//     return text.slice(0, this.maxOutputLength);
//   }
// }

// class RequestsPostTool extends Tool {
//   constructor(headers = {}, { maxOutputLength } = {}) {
//     super();
//     this.name = 'requests_post';
//     this.headers = headers;
//     this.maxOutputLength = maxOutputLength || Infinity;
//     this.description = `Use this when you want to POST to a website.
//  - Input should be a json string with two keys: "url" and "data".
//  - The value of "url" should be a string, and the value of "data" should be a dictionary of
//  - key-value pairs you want to POST to the url as a JSON body.
//  - Be careful to always use double quotes for strings in the json string
//  - The output will be the text response of the POST request.`;
//   }

//   async _call(input) {
//     try {
//       const { url, data } = JSON.parse(input);
//       const res = await fetch(url, {
//         method: 'POST',
//         headers: this.headers,
//         body: JSON.stringify(data)
//       });
//       const text = await res.text();
//       return text.slice(0, this.maxOutputLength);
//     } catch (error) {
//       return `${error}`;
//     }
//   }
// }

class HttpRequestTool extends Tool {
  constructor(headers = {}, { maxOutputLength = Infinity } = {}) {
    super();
    this.headers = headers;
    this.name = 'http_request';
    this.maxOutputLength = maxOutputLength;
    this.description = `Executes HTTP methods (GET, POST, PUT, DELETE, etc.). The input is an object with three keys: "url", "method", and "data". Even for GET or DELETE, include "data" key as an empty string. "method" is the HTTP method, and "url" is the desired endpoint. If POST or PUT, "data" should contain a stringified JSON representing the body to send. Only one url per use.`;
  }

  async _call(input) {
    try {
      const urlPattern = /"url":\s*"([^"]*)"/;
      const methodPattern = /"method":\s*"([^"]*)"/;
      const dataPattern = /"data":\s*"([^"]*)"/;

      const url = input.match(urlPattern)[1];
      const method = input.match(methodPattern)[1];
      let data = input.match(dataPattern)[1];

      // Parse 'data' back to JSON if possible
      try {
        data = JSON.parse(data);
      } catch (e) {
        // If it's not a JSON string, keep it as is
      }

      let options = {
        method: method,
        headers: this.headers
      };

      if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase()) && data) {
        if (typeof data === 'object') {
          options.body = JSON.stringify(data);
        } else {
          options.body = data;
        }
        options.headers['Content-Type'] = 'application/json';
      }

      const res = await fetch(url, options);

      const text = await res.text();
      if (text.includes('<html')) {
        return 'This tool is not designed to browse web pages. Only use it for API calls.';
      }

      return text.slice(0, this.maxOutputLength);
    } catch (error) {
      console.log(error);
      return `${error}`;
    }
  }
}

module.exports = HttpRequestTool;
