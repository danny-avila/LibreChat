const express = require('express');
const router = express.Router();
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { logger } = require('~/config');
const { requireApiKey } = require('../middleware');

const model =
  'arn:aws:bedrock:us-east-2:223287545160:inference-profile/us.anthropic.claude-3-haiku-20240307-v1:0';

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.BEDROCK_AWS_REGION || 'us-east-2',
  credentials: {
    accessKeyId: process.env.BEDROCK_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.BEDROCK_AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.BEDROCK_AWS_SESSION_TOKEN,
  },
});

// docs: https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages.html
router.post('/', requireApiKey, async (req, res) => {
  try {
    const request = {
      anthropic_version: 'bedrock-2023-05-31',
      ...req.body,
    };

    logger.info('Bedrock completions request:', request);
    const command = new InvokeModelCommand({
      modelId: model,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(request),
    });
    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    res.status(200).json(responseBody);
  } catch (error) {
    logger.error('Error in Bedrock completions:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
