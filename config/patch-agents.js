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
      console.warn(`[patch-agents] WARNING: ${path.basename(file)} (Fix 1) — expected snippet not found, skipping`);
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
      console.warn(`[patch-agents] WARNING: ${path.basename(file)} (Fix 2) — expected snippet not found, skipping`);
    }
    continue;
  }

  fs.writeFileSync(file, content.replace(HANDLERS_OLD, HANDLERS_NEW), 'utf8');
  console.log(`[patch-agents] patched ${path.basename(file)} (Fix 2 — handleServerToolResult)`);
}

console.log('[patch-agents] done');
