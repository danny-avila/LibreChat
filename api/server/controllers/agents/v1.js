const { nanoid } = require('nanoid');
const {
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,
  getListAgents,
} = require('~/models/Agent');
const { logger } = require('~/config');

/**
 * Creates an Agent.
 * @route POST /Agents
 * @param {ServerRequest} req - The request object.
 * @param {AgentCreateParams} req.body - The request body.
 * @param {ServerResponse} res - The response object.
 * @returns {Agent} 201 - success response - application/json
 */
const createAgentHandler = async (req, res) => {
  try {
    const { tools = [], provider, name, description, instructions, model, ...agentData } = req.body;
    const { id: userId } = req.user;

    agentData.tools = tools
      .map((tool) => (typeof tool === 'string' ? req.app.locals.availableTools[tool] : tool))
      .filter(Boolean);

    Object.assign(agentData, {
      author: userId,
      name,
      description,
      instructions,
      provider,
      model,
    });

    agentData.id = `agent_${nanoid()}`;
    const agent = await createAgent(agentData);
    res.status(201).json(agent);
  } catch (error) {
    logger.error('[/Agents] Error creating agent', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Retrieves an Agent by ID.
 * @route GET /Agents/:id
 * @param {object} req - Express Request
 * @param {object} req.params - Request params
 * @param {string} req.params.id - Agent identifier.
 * @returns {Agent} 200 - success response - application/json
 * @returns {Error} 404 - Agent not found
 */
const getAgentHandler = async (req, res) => {
  try {
    const id = req.params.id;
    const agent = await getAgent({ id });
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    return res.status(200).json(agent);
  } catch (error) {
    logger.error('[/Agents/:id] Error retrieving agent', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Updates an Agent.
 * @route PATCH /Agents/:id
 * @param {object} req - Express Request
 * @param {object} req.params - Request params
 * @param {string} req.params.id - Agent identifier.
 * @param {AgentUpdateParams} req.body - The Agent update parameters.
 * @returns {Agent} 200 - success response - application/json
 */
const updateAgentHandler = async (req, res) => {
  try {
    const id = req.params.id;
    const updatedAgent = await updateAgent({ id, author: req.user.id }, req.body);
    return res.json(updatedAgent);
  } catch (error) {
    logger.error('[/Agents/:id] Error updating Agent', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Deletes an Agent based on the provided ID.
 * @route DELETE /Agents/:id
 * @param {object} req - Express Request
 * @param {object} req.params - Request params
 * @param {string} req.params.id - Agent identifier.
 * @returns {Agent} 200 - success response - application/json
 */
const deleteAgentHandler = async (req, res) => {
  try {
    const id = req.params.id;
    const agent = await getAgent({ id });
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    await deleteAgent({ id, author: req.user.id });
    return res.json({ message: 'Agent deleted' });
  } catch (error) {
    logger.error('[/Agents/:id] Error deleting Agent', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 *
 * @route GET /Agents
 * @param {object} req - Express Request
 * @param {object} req.query - Request query
 * @param {string} [req.query.user] - The user ID of the agent's author.
 * @returns {AgentListResponse} 200 - success response - application/json
 */
const getListAgentsHandler = async (req, res) => {
  try {
    const { user } = req.query;
    const filter = user ? { author: user } : {};
    const data = await getListAgents(filter);
    return res.json(data);
  } catch (error) {
    logger.error('[/Agents] Error listing Agents', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Uploads and updates an avatar for a specific agent.
 * @route POST /avatar/:agent_id
 * @param {object} req - Express Request
 * @param {object} req.params - Request params
 * @param {string} req.params.agent_id - The ID of the agent.
 * @param {Express.Multer.File} req.file - The avatar image file.
 * @param {object} req.body - Request body
 * @param {string} [req.body.metadata] - Optional metadata for the agent's avatar.
 * @returns {Object} 200 - success response - application/json
 */
const uploadAgentAvatarHandler = async (req, res) => {
  try {
    const { agent_id } = req.params;
    if (!agent_id) {
      return res.status(400).json({ message: 'Agent ID is required' });
    }

    return res.status(200).json({ message: 'uploadAgentAvatar controller needs to be updated!' });

    // let { metadata: _metadata = '{}' } = req.body;
    //
    // await validateAuthor({ req, openai });

    // const image = await uploadImageBuffer({
    //   req,
    //   context: FileContext.avatar,
    //   metadata: {
    //     buffer: req.file.buffer,
    //   },
    // });

    // try {
    //   _metadata = JSON.parse(_metadata);
    // } catch (error) {
    //   logger.error('[/avatar/:agent_id] Error parsing metadata', error);
    //   _metadata = {};
    // }

    // if (_metadata.avatar && _metadata.avatar_source) {
    //   const { deleteFile } = getStrategyFunctions(_metadata.avatar_source);
    //   try {
    //     await deleteFile(req, { filepath: _metadata.avatar });
    //     await deleteFileByFilter({ filepath: _metadata.avatar });
    //   } catch (error) {
    //     logger.error('[/avatar/:agent_id] Error deleting old avatar', error);
    //   }
    // }

    // const metadata = {
    //   ..._metadata,
    //   avatar: image.filepath,
    //   avatar_source: req.app.locals.fileStrategy,
    // };

    // const promises = [];
    // promises.push(
    //   updateAgentDoc(
    //     { agent_id },
    //     {
    //       avatar: {
    //         filepath: image.filepath,
    //         source: req.app.locals.fileStrategy,
    //       },
    //       user: req.user.id,
    //     },
    //   ),
    // );
    // promises.push(openai.beta.agents.update(agent_id, { metadata }));

    // const resolved = await Promise.all(promises);
    // res.status(201).json(resolved[1]);
  } catch (error) {
    const message = 'An error occurred while updating the Agent Avatar';
    logger.error(message, error);
    res.status(500).json({ message });
  }
};

module.exports = {
  createAgent: createAgentHandler,
  getAgent: getAgentHandler,
  updateAgent: updateAgentHandler,
  deleteAgent: deleteAgentHandler,
  getListAgents: getListAgentsHandler,
  uploadAgentAvatar: uploadAgentAvatarHandler,
};
