const express = require('express');
const router = express.Router();
const { logger } = require('~/config');
const { requireApiKey } = require('../middleware');
const { ChatBedrockConverse } = require('@langchain/aws');
const { removeNullishValues } = require('librechat-data-provider');

const defaultModelName = 'anthropic.claude-3-haiku-20240307-v1:0';
const toAwsModelName = (modelName) =>
  `arn:aws:bedrock:us-east-2:223287545160:inference-profile/us.${modelName}`;

// Supported models:
// https://docs.anthropic.com/en/docs/about-claude/models/all-models (select "AWS Bedrock" names)
router.post('/', requireApiKey, async (req, res) => {
  try {
    const { messages, model = defaultModelName } = req.body;

    logger.info('Bedrock completions request:', { messages });
    const response = await invoke({ messages, model });

    res.status(200).json({
      id: response.id,
      object: 'chat.completion',
      created: response.created,
      model: model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: response.content,
          },
          finish_reason: response.finish_reason,
        },
      ],
      usage: {
        input_tokens: response.usage_metadata.input_tokens,
        output_tokens: response.usage_metadata.output_tokens,
        total_tokens: response.usage_metadata.total_tokens,
      },
      service_tier: 'default',
    });
  } catch (error) {
    logger.error('Error in Bedrock completions:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

// returns AIMessageChunk
async function invoke({ messages, model }) {
  const {
    BEDROCK_AWS_SECRET_ACCESS_KEY,
    BEDROCK_AWS_ACCESS_KEY_ID,
    BEDROCK_AWS_SESSION_TOKEN,
    BEDROCK_AWS_DEFAULT_REGION,
  } = process.env;

  let credentials = {
    accessKeyId: BEDROCK_AWS_ACCESS_KEY_ID,
    secretAccessKey: BEDROCK_AWS_SECRET_ACCESS_KEY,
    ...(BEDROCK_AWS_SESSION_TOKEN && { sessionToken: BEDROCK_AWS_SESSION_TOKEN }),
  };

  if (
    (credentials.accessKeyId === undefined || credentials.accessKeyId === '') &&
    (credentials.secretAccessKey === undefined || credentials.secretAccessKey === '')
  ) {
    credentials = undefined;
  }

  const requestOptions = {
    model: toAwsModelName(model),
    region: BEDROCK_AWS_DEFAULT_REGION,
    streaming: false,
  };

  if (credentials) {
    requestOptions.credentials = credentials;
  }

  const config = {
    llmConfig: removeNullishValues(Object.assign(requestOptions)),
  };

  // create client
  const client = new ChatBedrockConverse(config.llmConfig);

  const response = await client.invoke(messages, config);
  return response;
}
