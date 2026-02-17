const express = require('express');
const { nanoid } = require('nanoid');
const { logger } = require('@librechat/data-schemas');
const { generateCheckAccess, isActionDomainAllowed } = require('@librechat/api');
const {
  Permissions,
  ResourceType,
  PermissionBits,
  PermissionTypes,
  actionDelimiter,
  removeNullishValues,
  validateActionDomain,
  validateAndParseOpenAPISpec,
} = require('librechat-data-provider');
const { encryptMetadata, domainParser } = require('~/server/services/ActionService');
const { findAccessibleResources } = require('~/server/services/PermissionService');
const db = require('~/models');
const { canAccessAgentResource } = require('~/server/middleware');

const router = express.Router();

const checkAgentCreate = generateCheckAccess({
  permissionType: PermissionTypes.AGENTS,
  permissions: [Permissions.USE, Permissions.CREATE],
  getRoleByName: db.getRoleByName,
});

/**
 * Retrieves all user's actions
 * @route GET /actions/
 * @param {string} req.params.id - Assistant identifier.
 * @returns {Action[]} 200 - success response - application/json
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const editableAgentObjectIds = await findAccessibleResources({
      userId,
      role: req.user.role,
      resourceType: ResourceType.AGENT,
      requiredPermissions: PermissionBits.EDIT,
    });

    const agentsResponse = await db.getListAgentsByAccess({
      accessibleIds: editableAgentObjectIds,
    });

    const editableAgentIds = agentsResponse.data.map((agent) => agent.id);
    const actions =
      editableAgentIds.length > 0
        ? await db.getActions({ agent_id: { $in: editableAgentIds } })
        : [];

    res.json(actions);
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
router.post(
  '/:agent_id',
  canAccessAgentResource({
    requiredPermission: PermissionBits.EDIT,
    resourceIdParam: 'agent_id',
  }),
  checkAgentCreate,
  async (req, res) => {
    try {
      const { agent_id } = req.params;

      /** @type {{ functions: FunctionTool[], action_id: string, metadata: ActionMetadata }} */
      const { functions, action_id: _action_id, metadata: _metadata } = req.body;
      if (!functions.length) {
        return res.status(400).json({ message: 'No functions provided' });
      }

      let metadata = await encryptMetadata(removeNullishValues(_metadata, true));
      const appConfig = req.config;

      // SECURITY: Validate the OpenAPI spec and extract the server URL
      if (metadata.raw_spec) {
        const validationResult = validateAndParseOpenAPISpec(metadata.raw_spec);
        if (!validationResult.status || !validationResult.serverUrl) {
          return res.status(400).json({
            message: validationResult.message || 'Invalid OpenAPI specification',
          });
        }

        // SECURITY: Validate the client-provided domain matches the spec's server URL domain
        // This prevents SSRF attacks where an attacker provides a whitelisted domain
        // but uses a different (potentially internal) URL in the raw_spec
        const domainValidation = validateActionDomain(metadata.domain, validationResult.serverUrl);
        if (!domainValidation.isValid) {
          logger.warn(`Domain mismatch detected: ${domainValidation.message}`, {
            userId: req.user.id,
            agent_id,
          });
          return res.status(400).json({
            message:
              'Domain mismatch: The domain in the OpenAPI spec does not match the provided domain',
          });
        }
      }

      const isDomainAllowed = await isActionDomainAllowed(
        metadata.domain,
        appConfig?.actions?.allowedDomains,
      );
      if (!isDomainAllowed) {
        return res.status(400).json({ message: 'Domain not allowed' });
      }

      let { domain } = metadata;
      domain = await domainParser(domain, true);

      if (!domain) {
        return res.status(400).json({ message: 'No domain provided' });
      }

      const action_id = _action_id ?? nanoid();
      const initialPromises = [];

      // Permissions already validated by middleware - load agent directly
      initialPromises.push(db.getAgent({ id: agent_id }));
      if (_action_id) {
        initialPromises.push(db.getActions({ action_id }, true));
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

      const { actions: _actions = [], author: agent_author } = agent ?? {};
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

      // Force version update since actions are changing
      const updatedAgent = await db.updateAgent(
        { id: agent_id },
        { tools, actions },
        {
          updatingUserId: req.user.id,
          forceVersion: true,
        },
      );

      // Only update user field for new actions
      const actionUpdateData = { metadata, agent_id };
      if (!actions_result || !actions_result.length) {
        // For new actions, use the agent owner's user ID
        actionUpdateData.user = agent_author || req.user.id;
      }

      /** @type {[Action]} */
      const updatedAction = await db.updateAction({ action_id }, actionUpdateData);

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
  },
);

/**
 * Deletes an action for a specific agent.
 * @route DELETE /actions/:agent_id/:action_id
 * @param {string} req.params.agent_id - The ID of the agent.
 * @param {string} req.params.action_id - The ID of the action to delete.
 * @returns {Object} 200 - success response - application/json
 */
router.delete(
  '/:agent_id/:action_id',
  canAccessAgentResource({
    requiredPermission: PermissionBits.EDIT,
    resourceIdParam: 'agent_id',
  }),
  checkAgentCreate,
  async (req, res) => {
    try {
      const { agent_id, action_id } = req.params;

      // Permissions already validated by middleware - load agent directly
      const agent = await db.getAgent({ id: agent_id });
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

      domain = await domainParser(domain, true);

      if (!domain) {
        return res.status(400).json({ message: 'No domain provided' });
      }

      const updatedTools = tools.filter((tool) => !(tool && tool.includes(domain)));

      // Force version update since actions are being removed
      await db.updateAgent(
        { id: agent_id },
        { tools: updatedTools, actions: updatedActions },
        { updatingUserId: req.user.id, forceVersion: true },
      );
      await db.deleteAction({ action_id });
      res.status(200).json({ message: 'Action deleted successfully' });
    } catch (error) {
      const message = 'Trouble deleting the Agent Action';
      logger.error(message, error);
      res.status(500).json({ message });
    }
  },
);

module.exports = router;
