/**
 * Open Responses API routes for LibreChat agents.
 *
 * Implements the Open Responses specification for a forward-looking,
 * agentic API that uses items as the fundamental unit and semantic
 * streaming events.
 *
 * Usage:
 *   POST /v1/responses - Create a response
 *   GET /v1/models - List available agents
 *
 * Request format:
 *   {
 *     "model": "agent_id_here",
 *     "input": "Hello!" or [{ type: "message", role: "user", content: "Hello!" }],
 *     "stream": true,
 *     "previous_response_id": "optional_conversation_id"
 *   }
 *
 * @see https://openresponses.org/specification
 */
const express = require('express');
const { createResponse, listModels } = require('~/server/controllers/agents/responses');
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
 * @route POST /v1/responses
 * @desc Create a model response following Open Responses specification
 * @access Private (JWT auth required)
 *
 * Request body:
 * {
 *   "model": "agent_id",                // Required: The agent ID to use
 *   "input": "..." | [...],             // Required: String or array of input items
 *   "stream": true,                     // Optional: Whether to stream (default: false)
 *   "previous_response_id": "...",      // Optional: Previous response for continuation
 *   "instructions": "...",              // Optional: Additional instructions
 *   "tools": [...],                     // Optional: Additional tools
 *   "tool_choice": "auto",              // Optional: Tool choice mode
 *   "max_output_tokens": 4096,          // Optional: Max tokens
 *   "temperature": 0.7                  // Optional: Temperature
 * }
 *
 * Response (streaming):
 * - SSE stream with semantic events:
 *   - response.in_progress
 *   - response.output_item.added
 *   - response.content_part.added
 *   - response.output_text.delta
 *   - response.output_text.done
 *   - response.function_call_arguments.delta
 *   - response.output_item.done
 *   - response.completed
 *   - [DONE]
 *
 * Response (non-streaming):
 * {
 *   "id": "resp_xxx",
 *   "object": "response",
 *   "created_at": 1234567890,
 *   "status": "completed",
 *   "model": "agent_id",
 *   "output": [...],                    // Array of output items
 *   "usage": { ... }
 * }
 */
router.post('/', createResponse);

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
router.get('/models', listModels);

module.exports = router;
