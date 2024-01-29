const { v4 } = require('uuid');
const OpenAI = require('openai');
const express = require('express');
const { actionDelimiter } = require('librechat-data-provider');
const { encryptMetadata } = require('~/server/services/ActionService');
const { updateAssistant, getAssistant } = require('~/models/Assistant');
const { updateAction, getActions } = require('~/models/Action');
const { logger } = require('~/config');

const router = express.Router();

/**
 * Retrieves all user's actions
 * @route GET /actions/
 * @param {string} req.params.id - Assistant identifier.
 * @returns {Action[]} 200 - success response - application/json
 */
router.get('/', async (req, res) => {
  try {
    res.json(await getActions({ user: req.user.id }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Adds or updates actions for a specific assistant.
 * @route POST /actions/:assistant_id
 * @param {string} req.params.assistant_id - The ID of the assistant.
 * @param {FunctionTool[]} req.body.functions - The functions to be added or updated.
 * @param {string} [req.body.action_id] - Optional ID for the action.
 * @param {ActionMetadata} req.body.metadata - Metadata for the action.
 * @returns {Object} 200 - success response - application/json
 */
router.post('/:assistant_id', async (req, res) => {
  try {
    const { assistant_id } = req.params;

    /** @type {{ functions: FunctionTool[], action_id: string, metadata: ActionMetadata }} */
    const { functions, action_id: _action_id, metadata: _metadata } = req.body;
    if (!functions.length) {
      return res.status(400).json({ message: 'No functions provided' });
    }

    const metadata = encryptMetadata(_metadata);

    const { domain } = metadata;
    if (!domain) {
      return res.status(400).json({ message: 'No domain provided' });
    }

    const action_id = _action_id ?? v4();
    const initialPromises = [];

    /** @type {OpenAI} */
    const openai = new OpenAI(process.env.OPENAI_API_KEY);

    initialPromises.push(getAssistant({ assistant_id, user: req.user.id }));
    initialPromises.push(openai.beta.assistants.retrieve(assistant_id));
    const [assistant_data, assistant] = await Promise.all(initialPromises);

    if (!assistant) {
      return res.status(404).json({ message: 'Assistant not found' });
    }

    const { actions: _actions = [] } = assistant_data ?? {};
    const actions = [];
    for (const action of _actions) {
      const [action_domain, current_action_id] = action.split(actionDelimiter);
      if (action_domain === domain && !_action_id) {
        // TODO: dupe check on the frontend
        return res.status(400).json({
          message: `Action sets cannot have duplicate domains - ${domain} already exists on another action`,
        });
      }

      if (current_action_id === action_id) {
        continue;
      }

      actions.push(action);
    }

    actions.push(`${domain}${actionDelimiter}${action_id}`);

    /** @type {{ tools: FunctionTool[] | { type: 'code_interpreter'|'retrieval'}[]}} */
    const { tools: _tools = [] } = assistant;

    const tools = _tools
      .filter(
        (tool) =>
          !(
            tool.function &&
            (tool.function.name.includes(domain) || tool.function.name.includes(action_id))
          ),
      )
      .concat(
        functions.map((tool) => ({
          ...tool,
          function: {
            ...tool.function,
            name: `${tool.function.name}${actionDelimiter}${domain}`,
          },
        })),
      );

    const promises = [];
    promises.push(
      updateAssistant(
        { assistant_id, user: req.user.id },
        {
          actions,
        },
      ),
    );
    promises.push(openai.beta.assistants.update(assistant_id, { tools }));
    // TODO: Auth handling
    promises.push(updateAction({ action_id, user: req.user.id }, { metadata, assistant_id }));

    /** @type {[AssistantDocument, Assistant, Action]} */
    const resolved = await Promise.all(promises);
    const sensitiveFields = ['api_key', 'oauth_client_id', 'oauth_client_secret'];
    for (let field of sensitiveFields) {
      if (resolved[2].metadata[field]) {
        delete resolved[2].metadata[field];
      }
    }
    res.json(resolved);
  } catch (error) {
    const message = 'Trouble updating the Assistant Action';
    logger.error(message, error);
    res.status(500).json({ message });
  }
});

module.exports = router;
