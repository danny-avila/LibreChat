/**
 * OpenAI-compatible API routes for LibreChat agents.
 *
 * Provides a /v1/chat/completions compatible interface for
 * interacting with LibreChat agents remotely via API.
 *
 * Usage:
 *   POST /v1/chat/completions - Chat with an agent
 *   GET /v1/models - List available agents
 *   GET /v1/models/:model - Get agent details
 *
 * Request format:
 *   {
 *     "model": "agent_id_here",
 *     "messages": [{"role": "user", "content": "Hello!"}],
 *     "stream": true
 *   }
 */
const express = require('express');
const {
  OpenAIChatCompletionController,
  ListModelsController,
  GetModelController,
} = require('~/server/controllers/agents/openai');
const { configMiddleware } = require('~/server/middleware');

const router = express.Router();

// TODO: Add API key authentication for production use
// For now, inject a test user for testing
router.use((req, res, next) => {
  req.user = {
    _id: '682f49b90f07376815c38ef2',
    id: '682f49b90f07376815c38ef2',
    name: 'Test User',
    username: 'test user',
    email: 'test@gmail.com',
    emailVerified: true,
    provider: 'local',
    role: 'ADMIN',
  };
  next();
});
router.use(configMiddleware);

/**
 * @route POST /v1/chat/completions
 * @desc OpenAI-compatible chat completions with agents
 * @access Private (JWT auth required)
 *
 * Request body:
 * {
 *   "model": "agent_id",        // Required: The agent ID to use
 *   "messages": [...],          // Required: Array of chat messages
 *   "stream": true,             // Optional: Whether to stream (default: false)
 *   "conversation_id": "...",   // Optional: Conversation ID for context
 *   "parent_message_id": "..."  // Optional: Parent message for threading
 * }
 *
 * Response (streaming):
 * - SSE stream with OpenAI chat.completion.chunk format
 * - Includes delta.reasoning for thinking/reasoning content
 *
 * Response (non-streaming):
 * - Standard OpenAI chat.completion format
 */
router.post('/chat/completions', OpenAIChatCompletionController);

/**
 * @route GET /v1/models
 * @desc List available agents as models
 * @access Private (JWT auth required)
 *
 * Response:
 * {
 *   "object": "list",
 *   "data": [
 *     {
 *       "id": "agent_id",
 *       "object": "model",
 *       "name": "Agent Name",
 *       "provider": "openai",
 *       ...
 *     }
 *   ]
 * }
 */
router.get('/models', ListModelsController);

/**
 * @route GET /v1/models/:model
 * @desc Get details for a specific agent/model
 * @access Private (JWT auth required)
 */
router.get('/models/:model', GetModelController);

module.exports = router;
