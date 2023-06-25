const express = require('express');
const router = express.Router();
const { AI_PROMPT, ClaudeClient, HUMAN_PROMPT } = require('../../../app/claude/ClaudeClient');
const { handleError } = require('./handlers');
const requireJwtAuth = require('../../../middleware/requireJwtAuth');

router.post('/', requireJwtAuth, async (req, res) => {
  const { endpoint, text } = req.body;
  if (text.length === 0) return handleError(res, { text: 'Prompt empty or too short' });
  if (endpoint !== 'claude') return handleError(res, { text: 'Illegal request' });

  const client = new ClaudeClient();

  const abortController = new AbortController();

  client
    .completeStream(
      {
        prompt: `${HUMAN_PROMPT} ${text} ${AI_PROMPT}`,
        stop_sequences: [HUMAN_PROMPT],
        max_tokens_to_sample: 200,
        model: "claude-1",
      },
      {
        onOpen: (response) => {
          console.log("Opened stream, HTTP status code", response.status);
        },
        onUpdate: (completion) => {
          console.log(completion.completion);
        },
        signal: abortController.signal,
      }
    )
    .catch((error) => {
      if (error.name === "AbortError") {
        console.log("Cancelled completeStream()");
      }
    });

  abortController.abort();

});

module.exports = router;
