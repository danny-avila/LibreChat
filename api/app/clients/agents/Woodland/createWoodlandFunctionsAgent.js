const { URL } = require('node:url');
const initializeFunctionsAgent = require('../Functions/initializeFunctionsAgent');

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

const { logger } = require('@librechat/data-schemas');

const HAZARDOUS_TERMS = [
  /\bduct\s*tape\b/i,
  /\bmodify\s*engine\b/i,
  /\bbypass\s*sensor\b/i,
  /\brig\s*up\b/i,
  /\btemporary\s*fix\b/i,
];

const scanForSafety = (text) => {
  if (typeof text !== 'string') return null;
  for (const regex of HAZARDOUS_TERMS) {
    if (regex.test(text)) {
      return `⚠️ [CRITICAL SAFETY WARNING] Your response contains a suggestion (${text.match(regex)[0]}) that violates Woodland safety policies. DO NOT recommend unsafe workarounds. Please provide authorized procedures only.`;
    }
  }
  return null;
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

      // Safety Scan
      let safetyWarning = null;
      if (typeof result === 'string') {
        safetyWarning = scanForSafety(result);
      } else if (result && typeof result === 'object') {
        safetyWarning = scanForSafety(result.output) || scanForSafety(result.text);
      }

      if (safetyWarning) {
        logger.error('[SafetyInterceptor] Blocked hazardous recommendation', {
          agent: agentName,
          warning: safetyWarning,
        });
        const blockedResponse = `${safetyWarning}\n\n[Human Review Required] This query has been flagged for safety review. Please contact a senior technician.`;
        if (typeof result === 'string') return blockedResponse;
        if (result && typeof result === 'object') {
          return { ...result, output: blockedResponse, text: blockedResponse };
        }
      }

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
  const filteredTools = pickTools(tools, allowedTools);
  const trimmedPastMessages = Array.isArray(pastMessages) ? pastMessages.slice(-6) : pastMessages;
  const executor = await initializeFunctionsAgent({
    tools: filteredTools,
    model,
    pastMessages: trimmedPastMessages,
    customName: customName || agentName,
    customInstructions: instructions || customInstructions,
    currentDateString,
    ...rest,
  });

  return wrapExecutor(executor, citationWhitelist, agentName);
};
