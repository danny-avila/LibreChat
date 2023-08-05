const { StructuredTool } = require('langchain/tools');
const axios = require('axios');
const { z } = require('zod');

const env = z.enum(['Nodejs', 'Go', 'Bash', 'Rust', 'Python3', 'PHP', 'Java', 'Perl', 'DotNET']);

function getServerURL() {
  const url = process.env.E2B_SERVER_URL || '';
  if (!url) {
    throw new Error('Missing E2B_SERVER_URL environment variable.');
  }
  return url;
}

const headers = {
  'Content-Type': 'application/json',
  'openai-conversation-id': 'some-uuid',
};

class RunCommand extends StructuredTool {
  constructor(fields) {
    super();
    this.name = 'RunCommand';
    this.url = fields.E2B_SERVER_URL || getServerURL();
    this.description =
      'Runs given terminal command in requested environment. To be used in tandem with WriteFile and ReadFile for Code interpretation and execution.';
    this.headers = headers;
    this.headers['openai-conversation-id'] = fields.conversationId;
    this.schema = z.object({
      command: z.string().describe('Terminal command to run, appropriate to the environment'),
      workDir: z.string().describe('Working directory to run the command in'),
      env: env.describe('Environment to run the command in'),
    });
  }

  async _call(data) {
    console.debug('Running command', data);
    const response = await axios({
      url: `${this.url}/commands`,
      method: 'post',
      headers: this.headers,
      data: data,
    });
    return JSON.stringify(response.data);
  }
}

class ReadFile extends StructuredTool {
  constructor(fields) {
    super();
    this.name = 'ReadFile';
    this.url = fields.E2B_SERVER_URL || getServerURL();
    this.description =
      'Reads a file from requested environment. To be used in tandem with WriteFile and RunCommand for Code interpretation and execution.';
    this.headers = headers;
    this.headers['openai-conversation-id'] = fields.conversationId;
    this.schema = z.object({
      path: z.string().describe('Path of the file to read'),
      env: env.describe('Environment to read the file from'),
    });
  }

  async _call(data) {
    console.debug('Reading file', data);
    const response = await axios.get(`${this.url}/files`, { params: data, headers: this.headers });
    return response.data;
  }
}

class WriteFile extends StructuredTool {
  constructor(fields) {
    super();
    this.name = 'WriteFile';
    this.url = fields.E2B_SERVER_URL || getServerURL();
    this.description =
      'Writes to a file in requested environment. To be used in tandem with ReadFile and RunCommand for Code interpretation and execution.';
    this.headers = headers;
    this.headers['openai-conversation-id'] = fields.conversationId;
    this.schema = z.object({
      path: z.string().describe('Path to write the file to'),
      content: z.string().describe('Content to write in the file. Usually code.'),
      env: env.describe('Environment to write the file to'),
    });
  }

  async _call(data) {
    console.debug(
      'Writing to file',
      JSON.stringify({
        params: {
          path: data.path,
          env: data.env,
        },
        data: {
          content: data.content,
        },
      }),
    );
    await axios({
      url: `${this.url}/files`,
      method: 'put',
      headers: this.headers,
      params: {
        path: data.path,
        env: data.env,
      },
      data: {
        content: data.content,
      },
    });
    return `Successfully written to ${data.path} in ${data.env}`;
  }
}

module.exports = [RunCommand, ReadFile, WriteFile];
