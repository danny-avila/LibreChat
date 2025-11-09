const { URL } = require('node:url');
const initializeFunctionsAgent = require('../Functions/initializeFunctionsAgent');
const WoodlandQAKnowledge = require('../../tools/structured/WoodlandQAKnowledge');
const WoodlandAzureAISearchQA = require('../../tools/structured/WoodlandAzureAISearchQA');
const { logger } = require('@librechat/data-schemas');

const pickTools = (allTools = [], allowedNames = []) => {
  if (!allowedNames.length) {
    return allTools;
  }
  const nameSet = new Set(allowedNames);
  return allTools.filter((tool) => {
    const toolName = tool?.name || tool?.function?.name;
    return toolName && nameSet.has(toolName);
  });
};

const sanitizeCitations = (text, whitelist = []) => {
  if (!Array.isArray(whitelist) || whitelist.length === 0 || typeof text !== 'string') {
    return text;
  }

  const allowed = new Set(whitelist.map((host) => host.toLowerCase()));
  return text.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, (match, label, url) => {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      if (allowed.has(hostname)) {
        return match;
      }
      return label;
    } catch (error) {
      return label;
    }
  });
};

const wrapExecutor = (executor, whitelist, agentName = 'WoodlandAgent') => {
  if (!executor || typeof executor !== 'object') {
    return executor;
  }

  const wrap = (methodName) => {
    if (typeof executor[methodName] !== 'function') {
      return;
    }

    const original = executor[methodName].bind(executor);
    executor[methodName] = async (input, ...rest) => {
      const result = await original(input, ...rest);
      if (!whitelist || whitelist.length === 0) {
        return result;
      }

      if (typeof result === 'string') {
        const sanitized = sanitizeCitations(result, whitelist);
        if (sanitized !== result) {
          logger.warn('[WoodlandAgent] removed disallowed citation', {
            agent: agentName,
          });
        }
        return sanitized;
      }

      if (result && typeof result === 'object') {
        const cloned = Array.isArray(result) ? [...result] : { ...result };
        let changed = false;
        if (typeof cloned.output === 'string') {
          const sanitizedOutput = sanitizeCitations(cloned.output, whitelist);
          changed = changed || sanitizedOutput !== cloned.output;
          cloned.output = sanitizedOutput;
        }
        if (typeof cloned.text === 'string') {
          const sanitizedText = sanitizeCitations(cloned.text, whitelist);
          changed = changed || sanitizedText !== cloned.text;
          cloned.text = sanitizedText;
        }
        if (changed) {
          logger.warn('[WoodlandAgent] removed disallowed citation', {
            agent: agentName,
          });
        }
        return cloned;
      }

      return result;
    };
  };

  wrap('invoke');
  wrap('call');
  return executor;
};

module.exports = async function createWoodlandFunctionsAgent(
  { tools = [], model, pastMessages, customName, currentDateString, customInstructions, ...rest },
  { agentName, instructions, allowedTools, citationWhitelist },
) {
  // Add QA Knowledge tools if enabled
  const qaTools = [];
  
  // 1. LibreChat RAG-based QA tool
  if (process.env.WOODLAND_QA_ENABLED === 'true') {
    try {
      const ragQATool = new WoodlandQAKnowledge({
        qaFileId: process.env.WOODLAND_QA_FILE_ID, // Optional - will fallback to agent files
        entityId: agentName,
      });
      
      // Set userId from rest parameters if available
      if (rest.user_id || rest.userId) {
        ragQATool.setUserId(rest.user_id || rest.userId);
      }
      
      // Set agent files for fallback mode (when WOODLAND_QA_FILE_ID not set)
      if (rest.files || rest.agent_files || rest.agentFiles) {
        const agentFiles = rest.files || rest.agent_files || rest.agentFiles;
        ragQATool.setAgentFiles(agentFiles);
        logger.debug(`[${agentName}] RAG QA tool configured with ${agentFiles?.length || 0} agent files`);
      }

      // Auto-attach dedicated QA KB file to agent if WOODLAND_QA_FILE_ID is set and not already present
      try {
        if (process.env.WOODLAND_QA_FILE_ID) {
          const existingFiles = rest.files || rest.agent_files || rest.agentFiles || [];
          const hasQaFile = existingFiles.some((f) => {
            if (!f) return false;
            if (typeof f === 'string') return f === process.env.WOODLAND_QA_FILE_ID;
            return f.file_id === process.env.WOODLAND_QA_FILE_ID || f.id === process.env.WOODLAND_QA_FILE_ID;
          });
          if (!hasQaFile) {
            const qaFileStub = { file_id: process.env.WOODLAND_QA_FILE_ID, embedded: true, source: 'qa-knowledge-base' };
            // mutate rest to include the file for downstream prompt/context handlers
            if (Array.isArray(rest.files)) {
              rest.files.push(qaFileStub);
            } else if (Array.isArray(rest.agent_files)) {
              rest.agent_files.push(qaFileStub);
            } else if (Array.isArray(rest.agentFiles)) {
              rest.agentFiles.push(qaFileStub);
            } else {
              rest.files = [qaFileStub];
            }
            ragQATool.setAgentFiles((rest.files || rest.agent_files || rest.agentFiles));
            logger.info(`[${agentName}] Injected dedicated QA knowledge file ${process.env.WOODLAND_QA_FILE_ID} into agent context`);
          }
        }
      } catch (injectErr) {
        logger.warn(`[${agentName}] Failed to inject QA KB file into agent context:`, injectErr.message);
      }
      
      qaTools.push(ragQATool);
      logger.info(`[${agentName}] LibreChat RAG QA tool added (mode: ${process.env.WOODLAND_QA_FILE_ID ? 'dedicated-kb' : 'agent-files'})`);
    } catch (error) {
      logger.warn(`[${agentName}] Failed to initialize LibreChat RAG QA tool:`, error.message);
    }
  }
  
  // 2. Azure AI Search QA tool
  if (process.env.WOODLAND_AZURE_QA_ENABLED === 'true') {
    try {
      const azureQATool = new WoodlandAzureAISearchQA();
      qaTools.push(azureQATool);
      logger.info(`[${agentName}] Azure AI Search QA tool added (index: ${process.env.AZURE_AI_SEARCH_QA_INDEX || 'wpp-knowledge-qa'})`);
    } catch (error) {
      logger.warn(`[${agentName}] Failed to initialize Azure AI Search QA tool:`, error.message);
    }
  }

  // Merge QA tools with existing tools
  const allTools = qaTools.length > 0 ? [...qaTools, ...tools] : tools;
  const filteredTools = pickTools(tools, allowedTools);
  
  // Determine which tools to include based on allowedTools configuration
  let finalTools;
  if (qaTools.length > 0 && !allowedTools?.length) {
    // No restrictions: include all QA tools + filtered tools
    finalTools = [...qaTools, ...filteredTools];
  } else if (qaTools.length > 0 && allowedTools?.length > 0) {
    // Has restrictions: only include QA tools that are in allowedTools
    const allowedQATools = qaTools.filter(tool => 
      allowedTools.includes(tool.name)
    );
    finalTools = [...allowedQATools, ...filteredTools];
  } else {
    // No QA tools enabled
    finalTools = filteredTools;
  }

  const trimmedPastMessages = Array.isArray(pastMessages) ? pastMessages.slice(-6) : pastMessages;
  const executor = await initializeFunctionsAgent({
    tools: finalTools,
    model,
    pastMessages: trimmedPastMessages,
    customName: customName || agentName,
    customInstructions: instructions || customInstructions,
    currentDateString,
    ...rest,
  });

  return wrapExecutor(executor, citationWhitelist, agentName);
};
