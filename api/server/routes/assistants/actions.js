const { v4 } = require('uuid');
const express = require('express');
const { actionDelimiter } = require('librechat-data-provider');
const { initializeClient } = require('~/server/services/Endpoints/assistant');
const { updateAction, getActions, deleteAction } = require('~/models/Action');
const { updateAssistant, getAssistant } = require('~/models/Assistant');
const { encryptMetadata } = require('~/server/services/ActionService');
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

    let metadata = encryptMetadata(_metadata);

    const { domain } = metadata;
    if (!domain) {
      return res.status(400).json({ message: 'No domain provided' });
    }

    const action_id = _action_id ?? v4();
    const initialPromises = [];

    /** @type {{ openai: OpenAI }} */
    const { openai } = await initializeClient({ req, res });

    initialPromises.push(getAssistant({ assistant_id, user: req.user.id }));
    initialPromises.push(openai.beta.assistants.retrieve(assistant_id));
    !!_action_id && initialPromises.push(getActions({ user: req.user.id, action_id }, true));

    /** @type {[AssistantDocument, Assistant, [Action|undefined]]} */
    const [assistant_data, assistant, actions_result] = await Promise.all(initialPromises);

    if (actions_result && actions_result.length) {
      const action = actions_result[0];
      metadata = { ...action.metadata, ...metadata };
    }

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

/**
 * Deletes an action for a specific assistant.
 * @route DELETE /actions/:assistant_id/:action_id
 * @param {string} req.params.assistant_id - The ID of the assistant.
 * @param {string} req.params.action_id - The ID of the action to delete.
 * @returns {Object} 200 - success response - application/json
 */
router.delete('/:assistant_id/:action_id', async (req, res) => {
  try {
    const { assistant_id, action_id } = req.params;

    /** @type {{ openai: OpenAI }} */
    const { openai } = await initializeClient({ req, res });

    const initialPromises = [];
    initialPromises.push(getAssistant({ assistant_id, user: req.user.id }));
    initialPromises.push(openai.beta.assistants.retrieve(assistant_id));

    /** @type {[AssistantDocument, Assistant]} */
    const [assistant_data, assistant] = await Promise.all(initialPromises);

    const { actions } = assistant_data ?? {};
    const { tools = [] } = assistant ?? {};

    let domain = '';
    const updatedActions = actions.filter((action) => {
      if (action.includes(action_id)) {
        [domain] = action.split(actionDelimiter);
        return false;
      }
      return true;
    });

    const updatedTools = tools.filter(
      (tool) => !(tool.function && tool.function.name.includes(domain)),
    );

    const promises = [];
    promises.push(
      updateAssistant(
        { assistant_id, user: req.user.id },
        {
          actions: updatedActions,
        },
      ),
    );
    promises.push(openai.beta.assistants.update(assistant_id, { tools: updatedTools }));
    promises.push(deleteAction({ action_id, user: req.user.id }));

    await Promise.all(promises);
    res.status(200).json({ message: 'Action deleted successfully' });
  } catch (error) {
    const message = 'Trouble deleting the Assistant Action';
    logger.error(message, error);
    res.status(500).json({ message });
  }
});

module.exports = router;
