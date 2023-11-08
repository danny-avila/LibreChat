const OpenAI = require('openai');
const express = require('express');
const router = express.Router();
// const { requireJwtAuth } = require('../middleware/');
// router.get('/', requireJwtAuth, controller);

/**
 * Create an assistant.
 * @route POST /assistants
 * @param {AssistantCreateParams} req.body - The assistant creation parameters.
 * @returns {Assistant} 201 - success response - application/json
 */
router.post('/assistants', async (req, res) => {
  try {
    const openai = new OpenAI(process.env.OPENAI_API_KEY);
    const assistantData = req.body; // Your client should send the relevant data in the request body
    const assistant = await openai.beta.assistants.create(assistantData);
    res.status(201).json(assistant);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Retrieves an assistant.
 * @route GET /assistants/:id
 * @param {string} req.params.id - Assistant identifier.
 * @returns {Assistant} 200 - success response - application/json
 */
router.get('/assistants/:id', async (req, res) => {
  try {
    const openai = new OpenAI(process.env.OPENAI_API_KEY);
    const assistantId = req.params.id;
    const assistant = await openai.beta.assistants.retrieve(assistantId);
    res.json(assistant);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Modifies an assistant.
 * @route PATCH /assistants/:id
 * @param {string} req.params.id - Assistant identifier.
 * @param {AssistantUpdateParams} req.body - The assistant update parameters.
 * @returns {Assistant} 200 - success response - application/json
 */
router.patch('/assistants/:id', async (req, res) => {
  try {
    const openai = new OpenAI(process.env.OPENAI_API_KEY);
    const assistantId = req.params.id;
    const updateData = req.body;
    const updatedAssistant = await openai.beta.assistants.update(assistantId, updateData);
    res.json(updatedAssistant);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Deletes an assistant.
 * @route DELETE /assistants/:id
 * @param {string} req.params.id - Assistant identifier.
 * @returns {Assistant} 200 - success response - application/json
 */
router.delete('/assistants/:id', async (req, res) => {
  try {
    const openai = new OpenAI(process.env.OPENAI_API_KEY);
    const assistantId = req.params.id;
    const deletionStatus = await openai.beta.assistants.del(assistantId);
    res.json(deletionStatus);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Returns a list of assistants.
 * @route GET /assistants
 * @param {AssistantListParams} req.query - The assistant list parameters for pagination and sorting.
 * @returns {Array<Assistant>} 200 - success response - application/json
 */
router.get('/assistants', async (req, res) => {
  try {
    const openai = new OpenAI(process.env.OPENAI_API_KEY);
    const { limit, order } = req.query;
    const assistants = await openai.beta.assistants.list({
      limit,
      order,
    });
    res.json(assistants);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
