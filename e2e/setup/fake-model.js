/**
 * In-process fake LLM for credential-free e2e tests. Loaded by `@librechat/api`'s
 * `createRun` via the `LIBRECHAT_TEST_RUN_HOOK` env var (set by the mock
 * Playwright config and the `--profile=mock` recorder), it swaps the run's model
 * for the agents package's own `FakeChatModel` through
 * `run.Graph.overrideTestModel(...)`.
 *
 * This exercises the real `Run.create` -> graph -> tool-node pipeline end to end
 * without a live provider or a standalone HTTP mock server: responses are decided
 * from the conversation and the agents' advertised tools.
 */
const MOCK_REPLY = process.env.MOCK_LLM_REPLY || 'E2E mock reply: pong';
const CHUNK_DELAY_MS = Number(process.env.MOCK_LLM_CHUNK_DELAY_MS) || 10;

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

function messageType(message) {
  if (typeof message.getType === 'function') {
    return message.getType();
  }
  if (typeof message._getType === 'function') {
    return message._getType();
  }
  return message.role || message.type || '';
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

function getLatestUserText(messages) {
  if (!Array.isArray(messages)) {
    return '';
  }
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (!message) {
      continue;
    }
    const type = messageType(message);
    if (type === 'human' || type === 'user') {
      return getContentText(message.content);
    }
  }
  return '';
}

function getRequestedSkillName(text, marker) {
  const markerIndex = text.indexOf(marker);
  if (markerIndex === -1) {
    return '';
  }
  const afterMarker = text.slice(markerIndex + marker.length);
  return afterMarker.match(/[a-z0-9][a-z0-9-]*/)?.[0] ?? '';
}

function collectToolNames(agents) {
  const names = new Set();
  const add = (name) => {
    if (typeof name === 'string' && name) {
      names.add(name);
    }
  };
  for (const agent of agents ?? []) {
    if (!agent) {
      continue;
    }
    for (const tool of agent.tools ?? []) {
      add(tool?.name);
    }
    for (const def of agent.toolDefinitions ?? []) {
      add(def?.name);
    }
    if (agent.toolRegistry && typeof agent.toolRegistry.keys === 'function') {
      for (const name of agent.toolRegistry.keys()) {
        add(name);
      }
    }
  }
  return names;
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

/**
 * Pick the fake-model script for a skill file-authoring turn. The graph runs two
 * model turns: turn 1 streams the (empty) preamble and emits the tool call, the
 * tool node writes the SKILL.md, then turn 2 streams the final text. The guards
 * assert the feature advertised the host file-authoring tool and did NOT enable
 * code execution.
 */
function fileAuthoringResponses(operation, toolNames) {
  if (!toolNames.has(operation.toolName)) {
    return {
      responses: [`E2E file authoring unavailable: ${operation.toolName} was not advertised.`],
    };
  }
  if (toolNames.has(BASH_TOOL_NAME)) {
    return {
      responses: [`E2E file authoring unavailable: ${BASH_TOOL_NAME} was unexpectedly advertised.`],
    };
  }
  return {
    responses: ['', `${operation.finalText}: ${operation.skillName}`],
    toolCalls: [
      {
        id: operation.toolCallId,
        name: operation.toolName,
        args: operation.args,
        type: 'tool_call',
      },
    ],
  };
}

function resolveResponses(text, toolNames) {
  const createSkillName = getRequestedSkillName(text, CREATE_SKILL_MARKER);
  if (createSkillName) {
    return fileAuthoringResponses(
      {
        skillName: createSkillName,
        toolName: CREATE_FILE_TOOL_NAME,
        toolCallId: CREATE_SKILL_TOOL_CALL_ID,
        finalText: CREATE_FILE_AUTHORING_FINAL_TEXT,
        args: buildCreateSkillArgs(createSkillName),
      },
      toolNames,
    );
  }

  const editSkillName = getRequestedSkillName(text, EDIT_SKILL_MARKER);
  if (editSkillName) {
    return fileAuthoringResponses(
      {
        skillName: editSkillName,
        toolName: EDIT_FILE_TOOL_NAME,
        toolCallId: EDIT_SKILL_TOOL_CALL_ID,
        finalText: EDIT_FILE_AUTHORING_FINAL_TEXT,
        args: buildEditSkillArgs(editSkillName),
      },
      toolNames,
    );
  }

  return { responses: [MOCK_REPLY] };
}

/** @type {import('@librechat/api').TestRunHook} */
module.exports = function fakeModelHook(run, context) {
  const graph = run?.Graph;
  if (!graph || typeof graph.overrideTestModel !== 'function') {
    console.warn('[e2e] fake-model hook: run.Graph.overrideTestModel unavailable');
    return;
  }

  const text = getLatestUserText(context?.messages);
  const toolNames = collectToolNames(context?.agents);
  const { responses, toolCalls } = resolveResponses(text, toolNames);
  graph.overrideTestModel(responses, CHUNK_DELAY_MS, toolCalls);
};
