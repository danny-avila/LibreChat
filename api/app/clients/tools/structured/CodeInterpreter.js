const { StructuredTool } = require('langchain/tools');
const { PromptTemplate } = require('langchain/prompts');
const { createExtractionChainFromZod } = require('./extractionChain');
// const { ChatOpenAI } = require('langchain/chat_models/openai');
const axios = require('axios');
const { z } = require('zod');

const envs = ['Nodejs', 'Go', 'Bash', 'Rust', 'Python3', 'PHP', 'Java', 'Perl', 'DotNET'];
const env = z.enum(envs);

const template = `Extract the correct environment for the following code.

It must be one of these values: ${envs.join(', ')}.

Code:
{input}
`;

const prompt = PromptTemplate.fromTemplate(template);

// const schema = {
//   type: 'object',
//   properties: {
//     env: { type: 'string' },
//   },
//   required: ['env'],
// };

const zodSchema = z.object({
  env: z.string(),
});

async function extractEnvFromCode(code, model) {
  // const chatModel = new ChatOpenAI({ openAIApiKey, modelName: 'gpt-4-0613', temperature: 0 });
  const chain = createExtractionChainFromZod(zodSchema, model, { prompt, verbose: true });
  const result = await chain.run(code);
  console.log('<--------------- extractEnvFromCode --------------->');
  console.log(result);
  return result.env;
}

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
    console.log(`<--------------- Running ${data} --------------->`);
    const response = await axios({
      url: `${this.url}/commands`,
      method: 'post',
      headers: this.headers,
      data,
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
    console.log(`<--------------- Reading ${data} --------------->`);
    const response = await axios.get(`${this.url}/files`, { params: data, headers: this.headers });
    return response.data;
  }
}

class WriteFile extends StructuredTool {
  constructor(fields) {
    super();
    this.name = 'WriteFile';
    this.url = fields.E2B_SERVER_URL || getServerURL();
    this.model = fields.model;
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
    let { env, path, content } = data;
    console.log(`<--------------- environment ${env} typeof ${typeof env}--------------->`);
    if (env && !envs.includes(env)) {
      console.log(`<--------------- Invalid environment ${env} --------------->`);
      env = await extractEnvFromCode(content, this.model);
    } else if (!env) {
      console.log('<--------------- Undefined environment --------------->');
      env = await extractEnvFromCode(content, this.model);
    }

    const payload = {
      params: {
        path,
        env,
      },
      data: {
        content,
      },
    };
    console.log('Writing to file', JSON.stringify(payload));

    await axios({
      url: `${this.url}/files`,
      method: 'put',
      headers: this.headers,
      ...payload,
    });
    return `Successfully written to ${path} in ${env}`;
  }
}

module.exports = [RunCommand, ReadFile, WriteFile];
