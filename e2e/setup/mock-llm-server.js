/**
 * OpenAI-compatible mock server for credential-free e2e tests. Answers
 * `${baseURL}/chat/completions` with deterministic content. Run standalone
 * (Playwright `webServer`) or import `startMockLlm()` for programmatic control.
 */
const http = require('http');

const DEFAULT_PORT = 8889;
const MOCK_REPLY = process.env.MOCK_LLM_REPLY || 'E2E mock reply: pong';
const MODEL_FALLBACK = 'mock-model';
const STREAM_CHUNK_DELAY_MS = Number(process.env.MOCK_LLM_CHUNK_DELAY_MS) || 60;
const CREATE_SKILL_MARKER = 'E2E_CREATE_SKILL:';
const EDIT_SKILL_MARKER = 'E2E_EDIT_SKILL:';
const CREATE_FILE_AUTHORING_FINAL_TEXT = 'E2E file authoring complete';
const EDIT_FILE_AUTHORING_FINAL_TEXT = 'E2E file edit complete';
const CREATE_FILE_TOOL_NAME = 'create_file';
const EDIT_FILE_TOOL_NAME = 'edit_file';
const BASH_TOOL_NAME = 'bash_tool';
const CREATE_SKILL_TOOL_CALL_ID = 'call_e2e_create_skill';
const EDIT_SKILL_TOOL_CALL_ID = 'call_e2e_edit_skill';
const SKILL_DESCRIPTION =
  'Use this skill to verify LibreChat skill file authoring in mock end-to-end tests.';
const EDITED_SKILL_DESCRIPTION =
  'Use this edited skill to verify LibreChat skill file authoring in mock end-to-end tests.';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readJsonBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function toChunks(text) {
  return text.match(/\S+\s*/g) || [text];
}

function getToolName(tool) {
  if (!tool || typeof tool !== 'object') {
    return '';
  }
  if (typeof tool.name === 'string') {
    return tool.name;
  }
  if (tool.function && typeof tool.function.name === 'string') {
    return tool.function.name;
  }
  return '';
}

function hasTool(body, name) {
  const tools = Array.isArray(body.tools) ? body.tools : [];
  const functions = Array.isArray(body.functions) ? body.functions : [];
  return [...tools, ...functions].some((tool) => getToolName(tool) === name);
}

function getContentText(content) {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .map((part) => {
      if (typeof part === 'string') {
        return part;
      }
      if (part && typeof part === 'object' && typeof part.text === 'string') {
        return part.text;
      }
      return '';
    })
    .join('\n');
}

function getLatestUserText(body) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (!message || message.role !== 'user') {
      continue;
    }
    return getContentText(message.content);
  }
  return '';
}

function getRequestedSkillName(body, marker) {
  const text = getLatestUserText(body);
  const markerIndex = text.indexOf(marker);
  if (markerIndex === -1) {
    return '';
  }
  const afterMarker = text.slice(markerIndex + marker.length);
  const skillName = afterMarker.match(/[a-z0-9][a-z0-9-]*/)?.[0];
  if (skillName) {
    return skillName;
  }
  return '';
}

function hasFileAuthoringToolResult(body, toolCallId) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  return messages.some(
    (message) => message && message.role === 'tool' && message.tool_call_id === toolCallId,
  );
}

function buildSkillBody(skillName) {
  return `---
name: ${skillName}
description: ${SKILL_DESCRIPTION}
---

# ${skillName}

Created by the Playwright mock e2e suite to verify host file authoring without code execution.`;
}

function buildCreateSkillArgs(skillName) {
  return {
    file_path: `skills/${skillName}/SKILL.md`,
    content: buildSkillBody(skillName),
    overwrite: false,
  };
}

function buildEditSkillArgs(skillName) {
  return {
    file_path: `skills/${skillName}/SKILL.md`,
    old_text: `description: ${SKILL_DESCRIPTION}`,
    new_text: `description: ${EDITED_SKILL_DESCRIPTION}`,
  };
}

async function streamTextCompletion(res, model, text = MOCK_REPLY) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  const id = 'chatcmpl-e2e-mock';
  const created = 1700000000;
  const base = { id, object: 'chat.completion.chunk', created, model };

  const send = (delta, finishReason = null) => {
    const payload = {
      ...base,
      choices: [{ index: 0, delta, finish_reason: finishReason }],
    };
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  send({ role: 'assistant', content: '' });
  for (const chunk of toChunks(text)) {
    await delay(STREAM_CHUNK_DELAY_MS);
    send({ content: chunk });
  }
  send({}, 'stop');
  res.write('data: [DONE]\n\n');
  res.end();
}

async function streamToolCall(res, model, { toolName, toolCallId, args }) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  const id = 'chatcmpl-e2e-mock';
  const created = 1700000000;
  const base = { id, object: 'chat.completion.chunk', created, model };
  const send = (delta, finishReason = null) => {
    const payload = {
      ...base,
      choices: [{ index: 0, delta, finish_reason: finishReason }],
    };
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  send({ role: 'assistant', content: '' });
  await delay(STREAM_CHUNK_DELAY_MS);
  send({
    tool_calls: [
      {
        index: 0,
        id: toolCallId,
        type: 'function',
        function: { name: toolName, arguments: '' },
      },
    ],
  });
  await delay(STREAM_CHUNK_DELAY_MS);
  send({
    tool_calls: [
      {
        index: 0,
        function: { arguments: JSON.stringify(args) },
      },
    ],
  });
  send({}, 'tool_calls');
  res.write('data: [DONE]\n\n');
  res.end();
}

function jsonCompletion(res, model, content = MOCK_REPLY) {
  const payload = {
    id: 'chatcmpl-e2e-mock',
    object: 'chat.completion',
    created: 1700000000,
    model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  };
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function jsonToolCall(res, model, { toolName, toolCallId, args }) {
  const payload = {
    id: 'chatcmpl-e2e-mock',
    object: 'chat.completion',
    created: 1700000000,
    model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: toolCallId,
              type: 'function',
              function: {
                name: toolName,
                arguments: JSON.stringify(args),
              },
            },
          ],
        },
        finish_reason: 'tool_calls',
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  };
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

async function handleFileAuthoringOperation(body, res, model, operation) {
  const finalText = `${operation.finalText}: ${operation.skillName}`;
  if (hasFileAuthoringToolResult(body, operation.toolCallId)) {
    if (body.stream) {
      await streamTextCompletion(res, model, finalText);
    } else {
      jsonCompletion(res, model, finalText);
    }
    return true;
  }

  if (!hasTool(body, operation.toolName)) {
    const unavailable = `E2E file authoring unavailable: ${operation.toolName} was not advertised.`;
    if (body.stream) {
      await streamTextCompletion(res, model, unavailable);
    } else {
      jsonCompletion(res, model, unavailable);
    }
    return true;
  }

  if (hasTool(body, BASH_TOOL_NAME)) {
    const unexpected = `E2E file authoring unavailable: ${BASH_TOOL_NAME} was unexpectedly advertised.`;
    if (body.stream) {
      await streamTextCompletion(res, model, unexpected);
    } else {
      jsonCompletion(res, model, unexpected);
    }
    return true;
  }

  const toolCall = {
    toolName: operation.toolName,
    toolCallId: operation.toolCallId,
    args: operation.args,
  };
  if (body.stream) {
    await streamToolCall(res, model, toolCall);
  } else {
    jsonToolCall(res, model, toolCall);
  }
  return true;
}

async function handleFileAuthoringE2E(body, res, model) {
  const createSkillName = getRequestedSkillName(body, CREATE_SKILL_MARKER);
  if (createSkillName) {
    return await handleFileAuthoringOperation(body, res, model, {
      skillName: createSkillName,
      toolName: CREATE_FILE_TOOL_NAME,
      toolCallId: CREATE_SKILL_TOOL_CALL_ID,
      finalText: CREATE_FILE_AUTHORING_FINAL_TEXT,
      args: buildCreateSkillArgs(createSkillName),
    });
  }

  const editSkillName = getRequestedSkillName(body, EDIT_SKILL_MARKER);
  if (editSkillName) {
    return await handleFileAuthoringOperation(body, res, model, {
      skillName: editSkillName,
      toolName: EDIT_FILE_TOOL_NAME,
      toolCallId: EDIT_SKILL_TOOL_CALL_ID,
      finalText: EDIT_FILE_AUTHORING_FINAL_TEXT,
      args: buildEditSkillArgs(editSkillName),
    });
  }

  return false;
}

async function handleRequest(req, res) {
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (req.method === 'POST' && req.url && req.url.endsWith('/chat/completions')) {
    const body = await readJsonBody(req);
    const model = body.model || MODEL_FALLBACK;
    if (await handleFileAuthoringE2E(body, res, model)) {
      return;
    }
    if (body.stream) {
      await streamTextCompletion(res, model);
    } else {
      jsonCompletion(res, model);
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
}

function startMockLlm(port = Number(process.env.MOCK_LLM_PORT) || DEFAULT_PORT) {
  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch(() => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'mock server error' }));
    });
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      console.log(`[e2e] Mock LLM server listening on http://127.0.0.1:${port}`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  startMockLlm();
}

module.exports = { startMockLlm, MOCK_REPLY };
