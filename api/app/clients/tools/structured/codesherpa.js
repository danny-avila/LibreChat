const { StructuredTool } = require('langchain/tools');
const fs = require('fs');
const axios = require('axios');
const { z } = require('zod');

function getServerURL() {
  const url = process.env.CODE_SHERPA_SERVER_URL || '';
  if (!url) {
    throw new Error('Missing CODE_SHERPA_SERVER_URL environment variable.');
  }
  return url;
}

const headers = {
  'Content-Type': 'application/json',
};

class ExecuteReplCode extends StructuredTool {
  constructor(fields) {
    super();
    this.name = 'ExecuteReplCode';
    this.url = fields.CODE_SHERPA_SERVER_URL || getServerURL();
    this.description = 'Executes the provided code in a specified language.';
    this.headers = headers;
    this.schema = z.object({
      code: z.string().describe('The code to be executed in the REPL-like environment.'),
      language: z.string().describe('The programming language of the code to be executed.'),
    });
  }

  async _call(data) {
    const response = await axios({
      url: `${this.url}/repl`,
      method: 'post',
      headers: this.headers,
      data,
    });
    return response.data;
  }
}

class RunCommand extends StructuredTool {
  constructor(fields) {
    super();
    this.name = 'RunCommand';
    this.url = fields.CODE_SHERPA_SERVER_URL || getServerURL();
    this.description =
      'Runs the provided terminal command and returns the output or error message.';
    this.headers = headers;
    this.schema = z.object({
      command: z.string().describe('The terminal command to be executed.'),
    });
  }

  async _call(data) {
    const response = await axios({
      url: `${this.url}/command`,
      method: 'post',
      headers: this.headers,
      data,
    });
    return response.data;
  }
}

class UploadFile extends StructuredTool {
  constructor(fields) {
    super();
    this.name = 'UploadFile';
    this.url = fields.CODE_SHERPA_SERVER_URL || getServerURL();
    this.description = 'Endpoint to upload a file.';
    this.headers = headers;
    this.schema = z.object({
      file: z.string().describe('The file to be uploaded.'),
    });
  }

  async _call(data) {
    const formData = new FormData();
    formData.append('file', fs.createReadStream(data.file));

    const response = await axios({
      url: `${this.url}/upload`,
      method: 'post',
      headers: {
        ...this.headers,
        'Content-Type': `multipart/form-data; boundary=${formData._boundary}`,
      },
      data: formData,
    });
    return response.data;
  }
}

module.exports = [ExecuteReplCode, RunCommand, UploadFile];
