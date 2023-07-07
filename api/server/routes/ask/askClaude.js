const express = require('express');
const router = express.Router();
// const { AI_PROMPT, ClaudeClient, HUMAN_PROMPT } = require('../../../app/claude/ClaudeClient');
const { handleError } = require('./handlers');
const requireJwtAuth = require('../../../middleware/requireJwtAuth');
const { Anthropic } = require('@anthropic-ai/sdk');

router.post('/', requireJwtAuth, async (req, res) => {
  console.log('askClaude.js: req.body:', req.body)
  const { endpoint, text } = req.body;
  if (text.length === 0) return handleError(res, { text: 'Prompt empty or too short' });
  if (endpoint !== 'claude') return handleError(res, { text: 'Illegal request' });

  const anthropic = new Anthropic();

  const stream = await anthropic.completions.create({
    prompt: `${Anthropic.HUMAN_PROMPT} ${text} ${Anthropic.AI_PROMPT}`,
    model: 'claude-1',
    stream: true,
    max_tokens_to_sample: 300,
  });

  for await (const completion of stream) {
    console.log(completion.completion);
    return res.status(200).json({ text: completion.completion });
  }

  // const client = new ClaudeClient();

  // const abortController = new AbortController();

  // client
  //   .completeStream(
  //     {
  //       prompt: `${HUMAN_PROMPT} ${text} ${AI_PROMPT}`,
  //       stop_sequences: [HUMAN_PROMPT],
  //       max_tokens_to_sample: 200,
  //       model: "claude-1",
  //     },
  //     {
  //       onOpen: (response) => {
  //         console.log("Opened stream, HTTP status code", response.status);
  //       },
  //       onUpdate: (completion) => {
  //         console.log(completion.completion);
  //       },
  //       // signal: abortController.signal,
  //     }
  //   )
  //   .catch((error) => {
  //     if (error.name === "AbortError") {
  //       console.log("Cancelled completeStream()");
  //     }
  //   });

  // abortController.abort();

});

module.exports = router;
