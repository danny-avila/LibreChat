#!/usr/bin/env node
/**
 * Patches @librechat/agents to fix code_execution_20250825 server-side tool handling.
 *
 * Two complementary fixes:
 *
 * Fix 1 — areToolCallsInvoked (ToolNode.cjs / ToolNode.mjs)
 *   Root cause: toolsCondition routes back to the tool node whenever any tool_call ID
 *   is absent from graph.invokedToolIds. Server-side tool calls (IDs starting with
 *   'srvtoolu_') are filtered out of filteredCalls and never executed locally, so
 *   their IDs are never added to invokedToolIds — causing an infinite loop until the
 *   LangGraph recursion limit (10) is hit.
 *   Fix: Treat server-side tool calls as inherently "invoked" in areToolCallsInvoked,
 *   so toolsCondition routes to END when all remaining tool calls are server-side.
 *
 * Fix 2 — handleServerToolResult (handlers.cjs / handlers.mjs)
 *   When code_execution result blocks DO reach handleServerToolResult (via the
 *   CHAT_MODEL_STREAM handler), add the tool ID to invokedToolIds and dispatch
 *   ON_RUN_STEP_COMPLETED so the frontend marks the tool call as complete.
 *   This complements Fix 1 and ensures correct frontend state.
 */
const fs = require('fs');
const path = require('path');

const PACKAGE_ROOT = path.join(__dirname, '..', 'node_modules', '@librechat', 'agents');

// ---------------------------------------------------------------------------
// Fix 1: ToolNode — areToolCallsInvoked
// ---------------------------------------------------------------------------

const TOOL_NODE_TARGETS = [
  {
    file: path.join(PACKAGE_ROOT, 'dist', 'cjs', 'tools', 'ToolNode.cjs'),
    prefix: '_enum.Constants.ANTHROPIC_SERVER_TOOL_PREFIX',
  },
  {
    file: path.join(PACKAGE_ROOT, 'dist', 'esm', 'tools', 'ToolNode.mjs'),
    prefix: 'Constants.ANTHROPIC_SERVER_TOOL_PREFIX',
  },
];

for (const { file, prefix } of TOOL_NODE_TARGETS) {
  if (!fs.existsSync(file)) {
    console.log(`[patch-agents] skipping ${path.basename(file)} — not found`);
    continue;
  }

  const content = fs.readFileSync(file, 'utf8');

  const OLD = `function areToolCallsInvoked(message, invokedToolIds) {
    if (!invokedToolIds || invokedToolIds.size === 0)
        return false;
    return (message.tool_calls?.every((toolCall) => toolCall.id != null && invokedToolIds.has(toolCall.id)) ?? false);
}`;

  const NEW = `function areToolCallsInvoked(message, invokedToolIds) {
    const isServerCall = (id) => id?.startsWith(${prefix}) ?? false;
    if (!invokedToolIds || invokedToolIds.size === 0)
        return (message.tool_calls?.every((toolCall) => isServerCall(toolCall.id)) ?? false);
    return (message.tool_calls?.every((toolCall) => toolCall.id != null && (invokedToolIds.has(toolCall.id) || isServerCall(toolCall.id))) ?? false);
}`;

  if (!content.includes(OLD)) {
    if (content.includes(NEW)) {
      console.log(`[patch-agents] ${path.basename(file)} (Fix 1) already patched`);
    } else {
      console.warn(
        `[patch-agents] WARNING: ${path.basename(file)} (Fix 1) — expected snippet not found, skipping`,
      );
    }
    continue;
  }

  fs.writeFileSync(file, content.replace(OLD, NEW), 'utf8');
  console.log(`[patch-agents] patched ${path.basename(file)} (Fix 1 — areToolCallsInvoked)`);
}

// ---------------------------------------------------------------------------
// Fix 2: handlers — handleServerToolResult
// ---------------------------------------------------------------------------

const HANDLER_TARGETS = [
  path.join(PACKAGE_ROOT, 'dist', 'cjs', 'tools', 'handlers.cjs'),
  path.join(PACKAGE_ROOT, 'dist', 'esm', 'tools', 'handlers.mjs'),
];

const HANDLERS_OLD = `        if (contentPart.type === 'web_search_result' ||
            contentPart.type === 'web_search_tool_result') {
            await handleAnthropicSearchResults({
                contentPart: contentPart,
                toolCall,
                metadata,
                graph,
            });
        }
        if (!skipHandling) {
            skipHandling = true;
        }`;

const HANDLERS_NEW = `        if (contentPart.type === 'web_search_result' ||
            contentPart.type === 'web_search_tool_result') {
            await handleAnthropicSearchResults({
                contentPart: contentPart,
                toolCall,
                metadata,
                graph,
            });
        }
        else {
            if (graph.invokedToolIds == null) {
                graph.invokedToolIds = new Set();
            }
            graph.invokedToolIds.add(toolCall.id);
            const resultContent = contentPart.content;
            const contentString = typeof resultContent === 'string' ? resultContent : JSON.stringify(resultContent ?? '');
            const handler = graph.handlerRegistry?.getHandler('on_run_step_completed');
            if (handler) {
                await handler.handle('on_run_step_completed', {
                    result: {
                        id: stepId,
                        index: runStep?.index ?? 0,
                        type: 'tool_call',
                        tool_call: {
                            id: toolCall.id,
                            name: toolCall.name ?? '',
                            args: typeof toolCall.args === 'string' ? toolCall.args : JSON.stringify(toolCall.args ?? {}),
                            output: contentString,
                            progress: 1,
                        },
                    },
                }, metadata, graph);
            }
        }
        if (!skipHandling) {
            skipHandling = true;
        }`;

for (const file of HANDLER_TARGETS) {
  if (!fs.existsSync(file)) {
    console.log(`[patch-agents] skipping ${path.basename(file)} — not found`);
    continue;
  }

  const content = fs.readFileSync(file, 'utf8');

  if (!content.includes(HANDLERS_OLD)) {
    if (content.includes(HANDLERS_NEW)) {
      console.log(`[patch-agents] ${path.basename(file)} (Fix 2) already patched`);
    } else {
      console.warn(
        `[patch-agents] WARNING: ${path.basename(file)} (Fix 2) — expected snippet not found, skipping`,
      );
    }
    continue;
  }

  fs.writeFileSync(file, content.replace(HANDLERS_OLD, HANDLERS_NEW), 'utf8');
  console.log(`[patch-agents] patched ${path.basename(file)} (Fix 2 — handleServerToolResult)`);
}

// ---------------------------------------------------------------------------
// Fix 3: message_inputs — strip orphaned server_tool_use blocks
// ---------------------------------------------------------------------------
//
// Root cause: when Anthropic runs a native web_search server-side, the response
// carries a `server_tool_use` block (id `srvtoolu_...`) paired with a
// `web_search_tool_result` block. If a follow-up API call is made in the same
// conversation (e.g. the model also called a regular/skill/MCP tool in that
// turn, forcing the graph back through the agent node), the stored assistant
// message can contain the `server_tool_use` block while its matching
// `web_search_tool_result` is missing or was dropped during streaming/state
// serialization. `sanitizeOrphanToolBlocks` deliberately ignores `srvtoolu_`
// IDs, so the orphan survives and Anthropic rejects the request with 400:
//   "web_search tool use ... was found without a corresponding
//    web_search_tool_result block".
//
// Fix: in the Anthropic message formatter (`_formatContent`), drop any
// `server_tool_use` block whose id has no matching `web_search_tool_result`
// (tool_use_id) in the same message. The search results text is still present
// as text blocks, so the model keeps the information; only the unusable
// orphaned tool-use block is removed, yielding a valid payload.

const buildOrphanStripBody = (prefix, sourceExpr, resultVar, returnFn) => `
        const ${resultVar} = new Set();
        for (const __srvBlock of ${sourceExpr}) {
            if (__srvBlock != null &&
                __srvBlock.type === 'web_search_tool_result' &&
                typeof __srvBlock.tool_use_id === 'string') {
                ${resultVar}.add(__srvBlock.tool_use_id);
            }
        }
        const __dedupedContentBlocks = ${sourceExpr}.filter((__srvBlock) => {
            if (__srvBlock != null &&
                __srvBlock.type === 'server_tool_use' &&
                typeof __srvBlock.id === 'string' &&
                (__srvBlock.id.startsWith(${prefix}) ?? false)) {
                return ${resultVar}.has(__srvBlock.id);
            }
            return true;
        });
${returnFn('__dedupedContentBlocks')}`;

const MESSAGE_INPUTS_TARGETS = [
  {
    file: path.join(PACKAGE_ROOT, 'dist', 'cjs', 'llm', 'anthropic', 'utils', 'message_inputs.cjs'),
    prefix: '_enum.Constants.ANTHROPIC_SERVER_TOOL_PREFIX',
  },
  {
    file: path.join(PACKAGE_ROOT, 'dist', 'esm', 'llm', 'anthropic', 'utils', 'message_inputs.mjs'),
    prefix: 'Constants.ANTHROPIC_SERVER_TOOL_PREFIX',
  },
];

for (const { file, prefix } of MESSAGE_INPUTS_TARGETS) {
  if (!fs.existsSync(file)) {
    console.log(`[patch-agents] skipping ${path.basename(file)} — not found`);
    continue;
  }

  const content = fs.readFileSync(file, 'utf8');

  // Layout A — 3.1.90+: filteredContentBlocks with empty-text guard + placeholder fallback.
  const OLD_A = `        const filteredContentBlocks = contentBlocks.filter((block) => block !== null &&
            !(block.type === 'text' &&
                'text' in block &&
                typeof block.text === 'string' &&
                block.text.trim() === ''));
        return filteredContentBlocks.length > 0
            ? filteredContentBlocks
            : [{ type: 'text', text: ANTHROPIC_EMPTY_TEXT_PLACEHOLDER }];`;

  const NEW_A = `        const filteredContentBlocks = contentBlocks.filter((block) => block !== null &&
            !(block.type === 'text' &&
                'text' in block &&
                typeof block.text === 'string' &&
                block.text.trim() === ''));${buildOrphanStripBody(
          prefix,
          'filteredContentBlocks',
          '__srvResultIds',
          (v) =>
            `        return ${v}.length > 0\n            ? ${v}\n            : [{ type: 'text', text: ANTHROPIC_EMPTY_TEXT_PLACEHOLDER }];`,
        )}`;

  // Layout B — 3.1.62: plain null filter.
  const OLD_B = `        return contentBlocks.filter((block) => block !== null);`;

  const NEW_B = `        const __filteredContentBlocks = contentBlocks.filter((block) => block !== null);${buildOrphanStripBody(
          prefix,
          '__filteredContentBlocks',
          '__srvResultIds',
          (v) => `        return ${v};`,
        )}`;

  const sentinel = '__dedupedContentBlocks';
  if (content.includes(sentinel) && content.includes('__srvResultIds')) {
    console.log(`[patch-agents] ${path.basename(file)} (Fix 3) already patched`);
    continue;
  }

  let next = content;
  if (content.includes(OLD_A)) {
    next = content.replace(OLD_A, NEW_A);
  } else if (content.includes(OLD_B)) {
    next = content.replace(OLD_B, NEW_B);
  } else {
    console.warn(
      `[patch-agents] WARNING: ${path.basename(file)} (Fix 3) — expected snippet not found, skipping`,
    );
    continue;
  }

  fs.writeFileSync(file, next, 'utf8');
  console.log(`[patch-agents] patched ${path.basename(file)} (Fix 3 — strip orphaned server_tool_use)`);
}

console.log('[patch-agents] done');
