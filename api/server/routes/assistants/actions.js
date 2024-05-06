const { v4 } = require('uuid');
const express = require('express');
const { encryptMetadata, domainParser } = require('~/server/services/ActionService');
const { actionDelimiter, EModelEndpoint } = require('librechat-data-provider');
const { initializeClient } = require('~/server/services/Endpoints/assistants');
const { updateAction, getActions, deleteAction } = require('~/models/Action');
const { updateAssistant, getAssistant } = require('~/models/Assistant');
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
    res.json(await getActions());
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

    let { domain } = metadata;
    /* Azure doesn't support periods in function names */
    domain = await domainParser(req, domain, true);

    if (!domain) {
      return res.status(400).json({ message: 'No domain provided' });
    }

    const action_id = _action_id ?? v4();
    const initialPromises = [];

    /** @type {{ openai: OpenAI }} */
    const { openai } = await initializeClient({ req, res });

    initialPromises.push(getAssistant({ assistant_id }));
    initialPromises.push(openai.beta.assistants.retrieve(assistant_id));
    !!_action_id && initialPromises.push(getActions({ action_id }, true));

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
      const [_action_domain, current_action_id] = action.split(actionDelimiter);
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

    let updatedAssistant = await openai.beta.assistants.update(assistant_id, { tools });
    const promises = [];
    promises.push(
      updateAssistant(
        { assistant_id },
        {
          actions,
          user: req.user.id,
        },
      ),
    );
    promises.push(updateAction({ action_id }, { metadata, assistant_id, user: req.user.id }));

    /** @type {[AssistantDocument, Action]} */
    let [assistantDocument, updatedAction] = await Promise.all(promises);
    const sensitiveFields = ['api_key', 'oauth_client_id', 'oauth_client_secret'];
    for (let field of sensitiveFields) {
      if (updatedAction.metadata[field]) {
        delete updatedAction.metadata[field];
      }
    }

    /* Map Azure OpenAI model to the assistant as defined by config */
    if (req.app.locals[EModelEndpoint.azureOpenAI]?.assistants) {
      updatedAssistant = {
        ...updatedAssistant,
        model: req.body.model,
      };
    }

    res.json([assistantDocument, updatedAssistant, updatedAction]);
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
router.delete('/:assistant_id/:action_id/:model', async (req, res) => {
  try {
    const { assistant_id, action_id, model } = req.params;
    req.body.model = model;

    /** @type {{ openai: OpenAI }} */
    const { openai } = await initializeClient({ req, res });

    const initialPromises = [];
    initialPromises.push(getAssistant({ assistant_id }));
    initialPromises.push(openai.beta.assistants.retrieve(assistant_id));

    /** @type {[AssistantDocument, Assistant]} */
    const [assistant_data, assistant] = await Promise.all(initialPromises);

    const { actions = [] } = assistant_data ?? {};
    const { tools = [] } = assistant ?? {};

    let domain = '';
    const updatedActions = actions.filter((action) => {
      if (action.includes(action_id)) {
        [domain] = action.split(actionDelimiter);
        return false;
      }
      return true;
    });

    domain = await domainParser(req, domain, true);

    const updatedTools = tools.filter(
      (tool) => !(tool.function && tool.function.name.includes(domain)),
    );

    await openai.beta.assistants.update(assistant_id, { tools: updatedTools });

    const promises = [];
    promises.push(
      updateAssistant(
        { assistant_id },
        {
          actions: updatedActions,
          user: req.user.id,
        },
      ),
    );
    promises.push(deleteAction({ action_id }));

    await Promise.all(promises);
    res.status(200).json({ message: 'Action deleted successfully' });
  } catch (error) {
    const message = 'Trouble deleting the Assistant Action';
    logger.error(message, error);
    res.status(500).json({ message });
  }
});

module.exports = router;
