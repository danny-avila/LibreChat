const { Tool } = require('langchain/tools');

class HttpRequestTool extends Tool {
  constructor(headers = {}, { maxOutputLength = Infinity } = {}) {
    super();
    this.headers = headers;
    this.name = 'http_request';
    this.maxOutputLength = maxOutputLength;
    this.description =
      'Executes HTTP methods (GET, POST, PUT, DELETE, etc.). The input is an object with three keys: "url", "method", and "data". Even for GET or DELETE, include "data" key as an empty string. "method" is the HTTP method, and "url" is the desired endpoint. If POST or PUT, "data" should contain a stringified JSON representing the body to send. Only one url per use.';
  }

  async _call(input) {
    try {
      const { url, method, data } = JSON.parse(input);

      let options = {
        method: method,
        headers: this.headers,
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
