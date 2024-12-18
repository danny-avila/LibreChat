const express = require('express');
const { nanoid } = require('nanoid');
const { actionDelimiter } = require('librechat-data-provider');
const { encryptMetadata, domainParser } = require('~/server/services/ActionService');
const { updateAction, getActions, deleteAction } = require('~/models/Action');
const { isActionDomainAllowed } = require('~/server/services/domains');
const { getAgent, updateAgent } = require('~/models/Agent');
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
 * Adds or updates actions for a specific agent.
 * @route POST /actions/:agent_id
 * @param {string} req.params.agent_id - The ID of the agent.
 * @param {FunctionTool[]} req.body.functions - The functions to be added or updated.
 * @param {string} [req.body.action_id] - Optional ID for the action.
 * @param {ActionMetadata} req.body.metadata - Metadata for the action.
 * @returns {Object} 200 - success response - application/json
 */
router.post('/:agent_id', async (req, res) => {
  try {
    const { agent_id } = req.params;

    /** @type {{ functions: FunctionTool[], action_id: string, metadata: ActionMetadata }} */
    const { functions, action_id: _action_id, metadata: _metadata } = req.body;
    if (!functions.length) {
      return res.status(400).json({ message: 'No functions provided' });
    }

    let metadata = await encryptMetadata(_metadata);
    const isDomainAllowed = await isActionDomainAllowed(metadata.domain);
    if (!isDomainAllowed) {
      return res.status(400).json({ message: 'Domain not allowed' });
    }

    let { domain } = metadata;
    domain = await domainParser(req, domain, true);

    if (!domain) {
      return res.status(400).json({ message: 'No domain provided' });
    }

    const action_id = _action_id ?? nanoid();
    const initialPromises = [];

    // TODO: share agents
    initialPromises.push(getAgent({ id: agent_id, author: req.user.id }));
    if (_action_id) {
      initialPromises.push(getActions({ action_id }, true));
    }

    /** @type {[Agent, [Action|undefined]]} */
    const [agent, actions_result] = await Promise.all(initialPromises);
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found for adding action' });
    }

    if (actions_result && actions_result.length) {
      const action = actions_result[0];
      metadata = { ...action.metadata, ...metadata };
    }

    const { actions: _actions = [] } = agent ?? {};
    const actions = [];
    for (const action of _actions) {
      const [_action_domain, current_action_id] = action.split(actionDelimiter);
      if (current_action_id === action_id) {
        continue;
      }

      actions.push(action);
    }

    actions.push(`${domain}${actionDelimiter}${action_id}`);

    /** @type {string[]}} */
    const { tools: _tools = [] } = agent;

    const tools = _tools
      .filter((tool) => !(tool && (tool.includes(domain) || tool.includes(action_id))))
      .concat(functions.map((tool) => `${tool.function.name}${actionDelimiter}${domain}`));

    const updatedAgent = await updateAgent(
      { id: agent_id, author: req.user.id },
      { tools, actions },
    );
    /** @type {[Action]} */
    const updatedAction = await updateAction(
      { action_id },
      { metadata, agent_id, user: req.user.id },
    );

    const sensitiveFields = ['api_key', 'oauth_client_id', 'oauth_client_secret'];
    for (let field of sensitiveFields) {
      if (updatedAction.metadata[field]) {
        delete updatedAction.metadata[field];
      }
    }

    res.json([updatedAgent, updatedAction]);
  } catch (error) {
    const message = 'Trouble updating the Agent Action';
    logger.error(message, error);
    res.status(500).json({ message });
  }
});

/**
 * Deletes an action for a specific agent.
 * @route DELETE /actions/:agent_id/:action_id
 * @param {string} req.params.agent_id - The ID of the agent.
 * @param {string} req.params.action_id - The ID of the action to delete.
 * @returns {Object} 200 - success response - application/json
 */
router.delete('/:agent_id/:action_id', async (req, res) => {
  try {
    const { agent_id, action_id } = req.params;

    const agent = await getAgent({ id: agent_id, author: req.user.id });
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found for deleting action' });
    }

    const { tools = [], actions = [] } = agent;

    let domain = '';
    const updatedActions = actions.filter((action) => {
      if (action.includes(action_id)) {
        [domain] = action.split(actionDelimiter);
        return false;
      }
      return true;
    });

    domain = await domainParser(req, domain, true);

    if (!domain) {
      return res.status(400).json({ message: 'No domain provided' });
    }

    const updatedTools = tools.filter((tool) => !(tool && tool.includes(domain)));

    await updateAgent(
      { id: agent_id, author: req.user.id },
      { tools: updatedTools, actions: updatedActions },
    );
    await deleteAction({ action_id });
    res.status(200).json({ message: 'Action deleted successfully' });
  } catch (error) {
    const message = 'Trouble deleting the Agent Action';
    logger.error(message, error);
    res.status(500).json({ message });
  }
});

module.exports = router;
