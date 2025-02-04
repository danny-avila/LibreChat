const { ToolCallTypes } = require('librechat-data-provider');
const validateAuthor = require('~/server/middleware/assistants/validateAuthor');
const { validateAndUpdateTool } = require('~/server/services/ActionService');
const { updateAssistantDoc } = require('~/models/Assistant');
const { manifestToolMap } = require('~/app/clients/tools');
const { getOpenAIClient } = require('./helpers');
const { logger } = require('~/config');

/**
 * Create an assistant.
 * @route POST /assistants
 * @param {AssistantCreateParams} req.body - The assistant creation parameters.
 * @returns {Assistant} 201 - success response - application/json
 */
const createAssistant = async (req, res) => {
  try {
    /** @type {{ openai: OpenAIClient }} */
    const { openai } = await getOpenAIClient({ req, res });

    const {
      tools = [],
      endpoint,
      conversation_starters,
      append_current_datetime,
      ...assistantData
    } = req.body;
    delete assistantData.conversation_starters;
    delete assistantData.append_current_datetime;

    assistantData.tools = tools
      .map((tool) => {
        if (typeof tool !== 'string') {
          return tool;
        }

        const toolDefinitions = req.app.locals.availableTools;
        const toolDef = toolDefinitions[tool];
        if (!toolDef && manifestToolMap[tool] && manifestToolMap[tool].toolkit === true) {
          return (
            Object.entries(toolDefinitions)
              .filter(([key]) => key.startsWith(`${tool}_`))
              // eslint-disable-next-line no-unused-vars
              .map(([_, val]) => val)
          );
        }

        return toolDef;
      })
      .filter((tool) => tool)
      .flat();

    let azureModelIdentifier = null;
    if (openai.locals?.azureOptions) {
      azureModelIdentifier = assistantData.model;
      assistantData.model = openai.locals.azureOptions.azureOpenAIApiDeploymentName;
    }

    assistantData.metadata = {
      author: req.user.id,
      endpoint,
    };

    const assistant = await openai.beta.assistants.create(assistantData);

    const createData = { user: req.user.id };
    if (conversation_starters) {
      createData.conversation_starters = conversation_starters;
    }
    if (append_current_datetime !== undefined) {
      createData.append_current_datetime = append_current_datetime;
    }

    const document = await updateAssistantDoc({ assistant_id: assistant.id }, createData);

    if (azureModelIdentifier) {
      assistant.model = azureModelIdentifier;
    }

    if (document.conversation_starters) {
      assistant.conversation_starters = document.conversation_starters;
    }
    if (append_current_datetime !== undefined) {
      assistant.append_current_datetime = append_current_datetime;
    }

    logger.debug('/assistants/', assistant);
    res.status(201).json(assistant);
  } catch (error) {
    logger.error('[/assistants] Error creating assistant', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Modifies an assistant.
 * @param {object} params
 * @param {Express.Request} params.req
 * @param {OpenAIClient} params.openai
 * @param {string} params.assistant_id
 * @param {AssistantUpdateParams} params.updateData
 * @returns {Promise<Assistant>} The updated assistant.
 */
const updateAssistant = async ({ req, openai, assistant_id, updateData }) => {
  await validateAuthor({ req, openai });
  const tools = [];
  let conversation_starters = null;

  if (updateData?.conversation_starters) {
    const conversationStartersUpdate = await updateAssistantDoc(
      { assistant_id: assistant_id },
      { conversation_starters: updateData.conversation_starters },
    );
    conversation_starters = conversationStartersUpdate.conversation_starters;

    delete updateData.conversation_starters;
  }

  if (updateData?.append_current_datetime !== undefined) {
    await updateAssistantDoc(
      { assistant_id: assistant_id },
      { append_current_datetime: updateData.append_current_datetime },
    );
    delete updateData.append_current_datetime;
  }

  let hasFileSearch = false;
  for (const tool of updateData.tools ?? []) {
    const toolDefinitions = req.app.locals.availableTools;
    let actualTool = typeof tool === 'string' ? toolDefinitions[tool] : tool;

    if (!actualTool && manifestToolMap[tool] && manifestToolMap[tool].toolkit === true) {
      actualTool = Object.entries(toolDefinitions)
        .filter(([key]) => key.startsWith(`${tool}_`))
        // eslint-disable-next-line no-unused-vars
        .map(([_, val]) => val);
    } else if (!actualTool) {
      continue;
    }

    if (Array.isArray(actualTool)) {
      for (const subTool of actualTool) {
        if (!subTool.function) {
          tools.push(subTool);
          continue;
        }

        const updatedTool = await validateAndUpdateTool({ req, tool: subTool, assistant_id });
        if (updatedTool) {
          tools.push(updatedTool);
        }
      }
      continue;
    }

    if (actualTool.type === ToolCallTypes.FILE_SEARCH) {
      hasFileSearch = true;
    }

    if (!actualTool.function) {
      tools.push(actualTool);
      continue;
    }

    const updatedTool = await validateAndUpdateTool({ req, tool: actualTool, assistant_id });
    if (updatedTool) {
      tools.push(updatedTool);
    }
  }

  if (hasFileSearch && !updateData.tool_resources) {
    const assistant = await openai.beta.assistants.retrieve(assistant_id);
    updateData.tool_resources = assistant.tool_resources ?? null;
  }

  if (hasFileSearch && !updateData.tool_resources?.file_search) {
    updateData.tool_resources = {
      ...(updateData.tool_resources ?? {}),
      file_search: {
        vector_store_ids: [],
      },
    };
  }

  updateData.tools = tools;

  if (openai.locals?.azureOptions && updateData.model) {
    updateData.model = openai.locals.azureOptions.azureOpenAIApiDeploymentName;
  }

  const assistant = await openai.beta.assistants.update(assistant_id, updateData);

  if (conversation_starters) {
    assistant.conversation_starters = conversation_starters;
  }

  return assistant;
};

/**
 * Modifies an assistant with the resource file id.
 * @param {object} params
 * @param {Express.Request} params.req
 * @param {OpenAIClient} params.openai
 * @param {string} params.assistant_id
 * @param {string} params.tool_resource
 * @param {string} params.file_id
 * @returns {Promise<Assistant>} The updated assistant.
 */
const addResourceFileId = async ({ req, openai, assistant_id, tool_resource, file_id }) => {
  const assistant = await openai.beta.assistants.retrieve(assistant_id);
  const { tool_resources = {} } = assistant;
  if (tool_resources[tool_resource]) {
    tool_resources[tool_resource].file_ids.push(file_id);
  } else {
    tool_resources[tool_resource] = { file_ids: [file_id] };
  }

  delete assistant.id;
  return await updateAssistant({
    req,
    openai,
    assistant_id,
    updateData: { tools: assistant.tools, tool_resources },
  });
};

/**
 * Deletes a file ID from an assistant's resource.
 * @param {object} params
 * @param {Express.Request} params.req
 * @param {OpenAIClient} params.openai
 * @param {string} params.assistant_id
 * @param {string} [params.tool_resource]
 * @param {string} params.file_id
 * @param {AssistantUpdateParams} params.updateData
 * @returns {Promise<Assistant>} The updated assistant.
 */
const deleteResourceFileId = async ({ req, openai, assistant_id, tool_resource, file_id }) => {
  const assistant = await openai.beta.assistants.retrieve(assistant_id);
  const { tool_resources = {} } = assistant;

  if (tool_resource && tool_resources[tool_resource]) {
    const resource = tool_resources[tool_resource];
    const index = resource.file_ids.indexOf(file_id);
    if (index !== -1) {
      resource.file_ids.splice(index, 1);
    }
  } else {
    for (const resourceKey in tool_resources) {
      const resource = tool_resources[resourceKey];
      const index = resource.file_ids.indexOf(file_id);
      if (index !== -1) {
        resource.file_ids.splice(index, 1);
        break;
      }
    }
  }

  delete assistant.id;
  return await updateAssistant({
    req,
    openai,
    assistant_id,
    updateData: { tools: assistant.tools, tool_resources },
  });
};

/**
 * Modifies an assistant.
 * @route PATCH /assistants/:id
 * @param {object} req - Express Request
 * @param {object} req.params - Request params
 * @param {string} req.params.id - Assistant identifier.
 * @param {AssistantUpdateParams} req.body - The assistant update parameters.
 * @returns {Assistant} 200 - success response - application/json
 */
const patchAssistant = async (req, res) => {
  try {
    const { openai } = await getOpenAIClient({ req, res });
    const assistant_id = req.params.id;
    const { endpoint: _e, ...updateData } = req.body;
    updateData.tools = updateData.tools ?? [];
    const updatedAssistant = await updateAssistant({ req, openai, assistant_id, updateData });
    res.json(updatedAssistant);
  } catch (error) {
    logger.error('[/assistants/:id] Error updating assistant', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  patchAssistant,
  createAssistant,
  updateAssistant,
  addResourceFileId,
  deleteResourceFileId,
};
