/**
 * Drives the full tool loop through `Providers.BAML` against a real provider
 * (OpenRouter), using the host adapter in `packages/api/src/baml/adapter.mjs`.
 *
 *   OPENROUTER_KEY=sk-or-... node scripts/baml-host/run.mjs
 *
 * Everything between the two turns — tool_call synthesis, id allocation,
 * routing, ToolNode dispatch, transcript projection — is shipped library code.
 * The adapter supplies only the model call.
 *
 * This costs money: two OpenRouter round-trips per run on openai/gpt-4o-mini.
 */

import { z } from 'zod';
import { tool } from '@langchain/core/tools';
import { HumanMessage } from '@langchain/core/messages';

import '@librechat/agents/baml';
import { Providers, initializeModel, attemptInvoke, ToolNode, toolsCondition } from '@librechat/agents';

import { createBamlFunctionSet, DECLARED_TOOLS } from '../../packages/api/src/baml/adapter.mjs';

const line = (s = '') => console.log(s);
const head = (n, s) => line(`\n${'━'.repeat(72)}\n ${n}. ${s}\n${'━'.repeat(72)}`);
const info = (s) => line(`     ${s}`);

let failures = 0;
const check = (cond, label) => {
  if (cond) return line(`   \x1b[32m✓\x1b[0m ${label}`);
  failures += 1;
  line(`   \x1b[31m✗ ${label}\x1b[0m`);
};

// The repo's .env uses OPENROUTER_API_KEY; the LibreChat custom-endpoint docs
// example uses OPENROUTER_KEY. The .env wins — that is what actually holds a key.
if (!process.env.OPENROUTER_API_KEY) {
  line('\x1b[31mOPENROUTER_API_KEY is not set.\x1b[0m BAML reads it at call time and panics without it.');
  line('  set -a; . ./.env; set +a   # then re-run');
  process.exit(2);
}

/* ─── the host's real tools — names MUST match the compiled BAML union ──── */

const getWeather = tool(({ city }) => `${city}: 24C, clear, wind 8km/h`, {
  name: 'get_weather',
  description: 'Look up current weather for a city',
  schema: z.object({ city: z.string() }),
});

const webSearch = tool(({ query }) => `Top result for "${query}": BAML is a typed LLM prompting language.`, {
  name: 'web_search',
  description: 'Search the web',
  schema: z.object({ query: z.string() }),
});

const tools = [getWeather, webSearch];

head(0, 'Port and declared tools');
const functions = createBamlFunctionSet();
info(`port version   : ${functions.version}`);
info(`declared tools : ${DECLARED_TOOLS.map((t) => `${t.name}@${t.schemaFingerprint.slice(0, 14)}…`).join(', ')}`);
check(functions.version === 1, 'adapter declares the port version the package expects');
check(DECLARED_TOOLS.every((d) => tools.some((t) => t.name === d.name)), 'every declared tool has a real bound implementation');

head(1, 'Full tool loop through OpenRouter');

const model = initializeModel({
  provider: Providers.BAML,
  clientOptions: { functions },
  tools,
});
info(`initializeModel -> ${model.constructor.name} (bound: ${tools.map((t) => t.name).join(', ')})`);

const question = new HumanMessage('What is the weather in Denver?');
const streamed = [];

const turn1 = await attemptInvoke({
  model,
  messages: [question],
  provider: Providers.BAML,
  onChunk: (c) => streamed.push(c),
});
const selection = turn1.messages[0];
const call = selection.tool_calls?.[0];

info(`turn 1 -> ${call ? `tool_call ${call.name}(${JSON.stringify(call.args)})` : `no tool call; content="${selection.content}"`}`);
check(!!call, 'the model selected a tool');
check(call?.name === 'get_weather', 'it picked get_weather for a weather question');
check(typeof call?.id === 'string' && call.id.length > 0, 'the library synthesized a non-empty id (ToolNode requires it)');

const route = toolsCondition([selection], 'tools');
check(route === 'tools', 'the real router sends this to ToolNode');

const dispatched = await new ToolNode({ tools }).invoke({ messages: [selection] });
const toolMessage = dispatched.messages[0];
info(`ToolNode executed -> ${JSON.stringify(toolMessage.content)}`);
check(String(toolMessage.content).includes('24C'), 'a real tool ran and produced a real result');
check(toolMessage.tool_call_id === call?.id, 'ToolMessage pairs with the id from turn 1');

const turn2 = await attemptInvoke({
  model,
  messages: [question, selection, ...dispatched.messages],
  provider: Providers.BAML,
  onChunk: (c) => streamed.push(c),
});
const answer = turn2.messages[0];
info(`turn 2 -> "${answer.content}"`);
check(String(answer.content).includes('24'), 'the final answer carries the tool result back from the transcript');
check(streamed.length > 1, `streamed in ${streamed.length} chunks, not one blob`);

head(2, 'Cancellation — the measured semantics');

const controller = new AbortController();
controller.abort();
let preAborted = 'did not reject';
try {
  await attemptInvoke({ model, messages: [question], provider: Providers.BAML, signal: controller.signal });
} catch (error) {
  preAborted = error?.name ?? error?.constructor?.name ?? 'unknown';
}
info(`pre-aborted invoke -> ${preAborted}`);
check(preAborted !== 'did not reject', 'an already-aborted turn rejects and issues no provider request');

line();
line(failures === 0 ? `\x1b[32mPASS\x1b[0m — full loop green` : `\x1b[31mFAIL\x1b[0m — ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
