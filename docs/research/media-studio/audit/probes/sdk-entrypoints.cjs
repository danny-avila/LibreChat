// Read-only probe: run from the LibreChat checkout; all provider fetches are intercepted.
const { createRequire } = require('node:module');
const requireFromCheckout = createRequire(`${process.cwd()}/package.json`);
const { CustomChatGoogleGenerativeAI } = requireFromCheckout('@librechat/agents/llm/google');
const { HumanMessage, AIMessage } = requireFromCheckout('@langchain/core/messages');
const requests = [];
globalThis.fetch = async (input, init) => {
  const req = new Request(input, init);
  requests.push(JSON.parse(await req.text()));
  const response = {
    candidates: [{ index: 0, content: { role: 'model', parts: [{ text: 'Hello' }] } }],
    usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5, totalTokenCount: 10 },
  };
  const streaming = req.url.includes(':streamGenerateContent');
  return new Response(streaming ? `data: ${JSON.stringify(response)}\n\n` : JSON.stringify(response), {
    headers: { 'content-type': streaming ? 'text/event-stream' : 'application/json' },
  });
};
async function probe(mode) {
  const calls = { start: 0, part: 0, complete: 0, restore: 0 };
  const port = {
    start: async () => { calls.start++; return { responseModalities: ['TEXT', 'IMAGE'] }; },
    part: async ({ part }) => { calls.part++; return { type: 'text', text: part.text }; },
    complete: async () => { calls.complete++; },
    fail: async () => {},
    restore: async () => {
      calls.restore++;
      return { kind: 'text', text: '', thoughtSignature: 'fixture-signature' };
    },
  };
  const model = new CustomChatGoogleGenerativeAI({
    model: 'gemini-3-pro-image-preview', apiKey: 'fixture', nativeMedia: port,
    maxRetries: 0, _lc_stream_delay: 0,
  });
  const messages = [
    new AIMessage({ content: [{ type: 'text', text: 'saved', native_media: { continuationRef: 'fixture-reference' } }] }),
    new HumanMessage('Draw'),
  ];
  const index = requests.length;
  if (mode === 'invoke') await model.invoke(messages);
  else if (mode === 'stream') for await (const chunk of await model.stream(messages)) {}
  else if (mode === 'streamEvents-v2') for await (const event of model.streamEvents(messages, { version: 'v2' })) {}
  else await model.streamEvents(messages, {}); // Default ChatModelStream is thenable; await consumes it.
  console.log(JSON.stringify({ mode, calls, request: requests[index] }));
}
(async () => {
  for (const mode of ['invoke', 'stream', 'streamEvents-v2', 'streamEvents-default']) await probe(mode);
})().catch((error) => { console.error(error.name, error.message); process.exitCode = 1; });
