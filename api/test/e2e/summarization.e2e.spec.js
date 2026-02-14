/**
 * E2E Backend Integration Tests for Summarization
 *
 * Exercises the FULL LibreChat → agents pipeline:
 *   LibreChat's createRun (@librechat/api)
 *     → agents package Run.create (@librechat/agents)
 *     → graph execution → summarization node → events
 *
 * Uses real AI providers, real formatAgentMessages, real token accounting.
 * Tracks summaries both mid-run and between runs.
 *
 * Run:
 *   npx jest --config api/test/e2e/jest.e2e.config.js
 */
const {
  Providers,
  Calculator,
  GraphEvents,
  ToolEndHandler,
  ModelEndHandler,
  ChatModelStreamHandler,
  formatAgentMessages,
  createContentAggregator,
  createTokenCounter,
} = require('@librechat/agents');
const { createRun } = require('@librechat/api');

// ---------------------------------------------------------------------------
// Shared test infrastructure
// ---------------------------------------------------------------------------

function createSpies() {
  return {
    onMessageDelta: jest.fn(),
    onRunStep: jest.fn(),
    onSummarizeStart: jest.fn(),
    onSummarizeDelta: jest.fn(),
    onSummarizeComplete: jest.fn(),
  };
}

/**
 * Builds event handlers matching LibreChat's getDefaultHandlers pattern,
 * but capturing events instead of writing to an SSE stream.
 */
function buildHandlers(collectedUsage, aggregateContent, spies) {
  return {
    [GraphEvents.TOOL_END]: new ToolEndHandler(),
    [GraphEvents.CHAT_MODEL_END]: new ModelEndHandler(collectedUsage),
    [GraphEvents.CHAT_MODEL_STREAM]: new ChatModelStreamHandler(),
    [GraphEvents.ON_RUN_STEP]: {
      handle: (event, data) => {
        spies.onRunStep(event, data);
        aggregateContent({ event, data });
      },
    },
    [GraphEvents.ON_RUN_STEP_COMPLETED]: {
      handle: (event, data) => {
        aggregateContent({ event, data });
      },
    },
    [GraphEvents.ON_RUN_STEP_DELTA]: {
      handle: (event, data) => {
        aggregateContent({ event, data });
      },
    },
    [GraphEvents.ON_MESSAGE_DELTA]: {
      handle: (event, data, metadata) => {
        spies.onMessageDelta(event, data, metadata);
        aggregateContent({ event, data });
      },
    },
    [GraphEvents.TOOL_START]: {
      handle: () => {},
    },
    // Summarization handlers (same as callbacks.js registers when enabled)
    [GraphEvents.ON_SUMMARIZE_START]: {
      handle: (_event, data) => {
        spies.onSummarizeStart(data);
      },
    },
    [GraphEvents.ON_SUMMARIZE_DELTA]: {
      handle: (_event, data) => {
        spies.onSummarizeDelta(data);
        aggregateContent({ event: GraphEvents.ON_SUMMARIZE_DELTA, data });
      },
    },
    [GraphEvents.ON_SUMMARIZE_COMPLETE]: {
      handle: (_event, data) => {
        spies.onSummarizeComplete(data);
      },
    },
  };
}

function getDefaultModel(provider) {
  switch (provider) {
    case Providers.ANTHROPIC:
      return 'claude-3-5-haiku-latest';
    case Providers.OPENAI:
      return 'gpt-4.1-mini';
    default:
      return 'gpt-4.1-mini';
  }
}

/**
 * Fills missing token counts for formatted LangChain messages.
 * Mirrors hydrateMissingIndexTokenCounts from client.js.
 */
function hydrateMissingIndexTokenCounts({ messages, indexTokenCountMap, tokenCounter }) {
  const hydratedMap = {};
  if (indexTokenCountMap) {
    for (const [index, tokenCount] of Object.entries(indexTokenCountMap)) {
      if (typeof tokenCount === 'number' && Number.isFinite(tokenCount) && tokenCount > 0) {
        hydratedMap[Number(index)] = tokenCount;
      }
    }
  }
  for (let i = 0; i < messages.length; i++) {
    if (
      typeof hydratedMap[i] === 'number' &&
      Number.isFinite(hydratedMap[i]) &&
      hydratedMap[i] > 0
    ) {
      continue;
    }
    hydratedMap[i] = tokenCounter(messages[i]);
  }
  return hydratedMap;
}

// ---------------------------------------------------------------------------
// Turn runner — mirrors AgentClient.chatCompletion() message flow
// ---------------------------------------------------------------------------

/**
 * Runs a single conversational turn through the full LibreChat pipeline:
 *   1. Build payload (TPayload) from conversation history
 *   2. formatAgentMessages (convert to LangChain messages)
 *   3. hydrateMissingIndexTokenCounts
 *   4. createRun via @librechat/api
 *   5. processStream
 *   6. Collect run messages for next turn
 */
async function runFullTurn({
  payload,
  agentProvider,
  summarizationProvider,
  summarizationModel,
  maxContextTokens,
  instructions,
  spies,
  tokenCounter,
  model,
}) {
  const collectedUsage = [];
  const { contentParts, aggregateContent } = createContentAggregator();

  // Step 1-2: formatAgentMessages (LibreChat's real message formatting)
  const formatted = formatAgentMessages(payload, {});
  let { messages: initialMessages, indexTokenCountMap, summary: initialSummary } = formatted;

  // Step 3: hydrate token counts (mirrors client.js)
  indexTokenCountMap = hydrateMissingIndexTokenCounts({
    messages: initialMessages,
    indexTokenCountMap,
    tokenCounter,
  });

  // Step 4: create Run via @librechat/api's createRun
  const abortController = new AbortController();
  const agent = {
    id: `test-agent-${agentProvider}`,
    name: 'Test Agent',
    provider: agentProvider,
    instructions: instructions,
    tools: [new Calculator()],
    maxContextTokens,
    model_parameters: {
      model: model || getDefaultModel(agentProvider),
      streaming: true,
      streamUsage: true,
    },
  };

  const summarizationConfig = {
    enabled: true,
    provider: summarizationProvider,
    model: summarizationModel || getDefaultModel(summarizationProvider),
    prompt:
      'You are a summarization assistant. Summarize the following conversation messages concisely, preserving key facts, decisions, and context needed to continue the conversation. Do not include preamble -- output only the summary.',
  };

  const run = await createRun({
    agents: [agent],
    messages: initialMessages,
    indexTokenCountMap,
    initialSummary,
    runId: `e2e-${Date.now()}`,
    signal: abortController.signal,
    customHandlers: buildHandlers(collectedUsage, aggregateContent, spies),
    summarizationConfig,
    tokenCounter,
  });

  // Step 5: process the stream
  // Higher recursionLimit to accommodate multi-cycle summarization + tool call rounds
  const streamConfig = {
    configurable: { thread_id: `e2e-${Date.now()}` },
    recursionLimit: 100,
    streamMode: 'values',
    version: 'v2',
  };
  const result = await run.processStream({ messages: initialMessages }, streamConfig);

  // Step 6: collect run messages
  const runMessages = run.getRunMessages() || [];

  return {
    result,
    runMessages,
    collectedUsage,
    contentParts,
    indexTokenCountMap,
  };
}

function getLastContent(runMessages) {
  const last = runMessages[runMessages.length - 1];
  if (!last) {
    return '';
  }
  return typeof last.content === 'string' ? last.content : JSON.stringify(last.content);
}

// ---------------------------------------------------------------------------
// Anthropic Tests
// ---------------------------------------------------------------------------

const hasAnthropic =
  process.env.ANTHROPIC_API_KEY != null && process.env.ANTHROPIC_API_KEY !== 'test';
(hasAnthropic ? describe : describe.skip)('Anthropic Summarization E2E (LibreChat)', () => {
  const instructions =
    'You are an expert math tutor. You MUST use the calculator tool for ALL computations. Keep answers to 1-2 sentences.';

  test('multi-turn triggers summarization, summary persists across runs', async () => {
    const spies = createSpies();
    const tokenCounter = await createTokenCounter();
    const conversationPayload = [];

    const addTurn = async (userMsg, maxTokens) => {
      conversationPayload.push({ role: 'user', content: userMsg });
      const result = await runFullTurn({
        payload: conversationPayload,
        agentProvider: Providers.ANTHROPIC,
        summarizationProvider: Providers.ANTHROPIC,
        summarizationModel: 'claude-3-5-haiku-latest',
        maxContextTokens: maxTokens,
        instructions,
        spies,
        tokenCounter,
      });
      conversationPayload.push({ role: 'assistant', content: getLastContent(result.runMessages) });
      return result;
    };

    // Build up conversation with tool calls.
    // The payload stores only final user/assistant text (not internal tool calls/results),
    // so token counts are modest. However, during each run the model may make 1-3 tool
    // calls which grow the graph state. maxContextTokens must be:
    //   - Large enough in early turns to avoid premature pruning
    //   - Small enough in later turns to trigger pruning/summarization
    //   - Not so tight that the model can't complete tool call rounds after summarization
    await addTurn('What is 12345 * 6789? Use the calculator.', 2000);
    console.log(`  T1: ${conversationPayload.length} entries`);

    await addTurn(
      'Now divide that result by 137. Then multiply by 42. Calculator for each step.',
      2000,
    );
    console.log(`  T2: ${conversationPayload.length} entries`);

    await addTurn(
      'Compute step by step: 1) 9876543 - 1234567  2) sqrt of result  3) Add 100. Calculator for each.',
      1500,
    );
    console.log(`  T3: ${conversationPayload.length} entries`);

    // Moderate squeeze: tool calls within this run may grow the state beyond budget,
    // triggering summarization. Must leave enough room after summarization for
    // the model to complete its response (including tool calls).
    await addTurn('What is 2^20? Calculator. Then list everything we calculated so far.', 800);
    console.log(`  T4: ${conversationPayload.length} entries`);

    if (spies.onSummarizeStart.mock.calls.length === 0) {
      await addTurn('Calculate 355 / 113. Calculator.', 600);
      console.log(`  T5: ${conversationPayload.length} entries`);
    }

    if (spies.onSummarizeStart.mock.calls.length === 0) {
      await addTurn('What is 999 * 999? Calculator.', 400);
      console.log(`  T6: ${conversationPayload.length} entries`);
    }

    // --- Assert summarization fired ---
    const startCalls = spies.onSummarizeStart.mock.calls.length;
    const completeCalls = spies.onSummarizeComplete.mock.calls.length;
    console.log(`  Summarization events: start=${startCalls}, complete=${completeCalls}`);

    expect(startCalls).toBeGreaterThanOrEqual(1);
    expect(completeCalls).toBeGreaterThanOrEqual(1);

    const startPayload = spies.onSummarizeStart.mock.calls[0][0];
    expect(startPayload.agentId).toBeDefined();
    expect(startPayload.provider).toBeDefined();
    expect(startPayload.messagesToRefineCount).toBeGreaterThan(0);
    expect(startPayload.summaryVersion).toBeGreaterThanOrEqual(1);

    const completePayload = spies.onSummarizeComplete.mock.calls[0][0];
    expect(completePayload.summary).toBeDefined();
    expect(completePayload.summary.text.length).toBeGreaterThan(10);
    expect(completePayload.summary.tokenCount).toBeGreaterThan(0);
    expect(completePayload.summary.tokenCount).toBeLessThan(2000);
    expect(completePayload.summary.provider).toBeDefined();
    expect(completePayload.summary.createdAt).toBeDefined();

    // Gap #8: summaryVersion and rangeHash populated
    expect(completePayload.summary.summaryVersion).toBeGreaterThanOrEqual(1);
    expect(completePayload.summary.rangeHash).toBeDefined();
    expect(typeof completePayload.summary.rangeHash).toBe('string');
    expect(completePayload.summary.rangeHash.length).toBe(16);

    console.log(
      `  Summary: version=${completePayload.summary.summaryVersion}, ` +
        `hash=${completePayload.summary.rangeHash}, tokens=${completePayload.summary.tokenCount}`,
    );
    console.log(`  Summary text (first 200): "${completePayload.summary.text.substring(0, 200)}"`);

    // --- Cross-run: persist summary → formatAgentMessages → new run ---
    const summaryBlock = completePayload.summary;
    const crossRunPayload = [
      {
        role: 'assistant',
        content: [
          { type: 'summary', text: summaryBlock.text, tokenCount: summaryBlock.tokenCount },
        ],
      },
      conversationPayload[conversationPayload.length - 2],
      conversationPayload[conversationPayload.length - 1],
      {
        role: 'user',
        content: 'What was the first calculation we did? Verify with calculator.',
      },
    ];

    spies.onSummarizeStart.mockClear();
    spies.onSummarizeComplete.mockClear();

    const crossRun = await runFullTurn({
      payload: crossRunPayload,
      agentProvider: Providers.ANTHROPIC,
      summarizationProvider: Providers.ANTHROPIC,
      summarizationModel: 'claude-3-5-haiku-latest',
      maxContextTokens: 2000,
      instructions,
      spies,
      tokenCounter,
    });

    expect(crossRun.runMessages.length).toBeGreaterThan(0);
    console.log(
      `  Cross-run response: "${getLastContent(crossRun.runMessages).substring(0, 200)}"`,
    );
    console.log(`  Cross-run summarization fires: ${spies.onSummarizeStart.mock.calls.length}`);
  });

  test('tight context (maxContextTokens=200) does not infinite-loop', async () => {
    const spies = createSpies();
    const tokenCounter = await createTokenCounter();
    const conversationPayload = [];

    // Build conversation at normal size
    conversationPayload.push({ role: 'user', content: 'What is 42 * 58? Calculator.' });
    const t1 = await runFullTurn({
      payload: conversationPayload,
      agentProvider: Providers.ANTHROPIC,
      summarizationProvider: Providers.ANTHROPIC,
      summarizationModel: 'claude-3-5-haiku-latest',
      maxContextTokens: 2000,
      instructions,
      spies,
      tokenCounter,
    });
    conversationPayload.push({ role: 'assistant', content: getLastContent(t1.runMessages) });

    conversationPayload.push({ role: 'user', content: 'Now compute 2436 + 1337. Calculator.' });
    const t2 = await runFullTurn({
      payload: conversationPayload,
      agentProvider: Providers.ANTHROPIC,
      summarizationProvider: Providers.ANTHROPIC,
      summarizationModel: 'claude-3-5-haiku-latest',
      maxContextTokens: 2000,
      instructions,
      spies,
      tokenCounter,
    });
    conversationPayload.push({ role: 'assistant', content: getLastContent(t2.runMessages) });

    // Tight context — must not infinite-loop
    conversationPayload.push({ role: 'user', content: 'What is 100 / 4? Calculator.' });

    let error;
    try {
      await runFullTurn({
        payload: conversationPayload,
        agentProvider: Providers.ANTHROPIC,
        summarizationProvider: Providers.ANTHROPIC,
        summarizationModel: 'claude-3-5-haiku-latest',
        maxContextTokens: 200,
        instructions,
        spies,
        tokenCounter,
      });
    } catch (err) {
      error = err;
    }

    // With real tools + tight context, the model may produce repeated tool call rounds
    // that keep growing the message count, allowing re-summarization on each cycle.
    // This is bounded by the graph's recursionLimit (the expected safety valve).
    // The key guarantee: the system terminates — no true infinite loop.
    if (error) {
      // Both "Recursion limit" (bounded tool-call cycles) and "empty_messages"
      // (context too small for any message) are valid termination modes.
      const isCleanTermination =
        error.message.includes('Recursion limit') || error.message.includes('empty_messages');
      expect(isCleanTermination).toBe(true);
      console.log(`  Tight context: terminated with: ${error.message.substring(0, 100)}`);
    } else {
      console.log(`  Tight context: completed cleanly`);
    }

    // Summarization should have fired at least once before termination
    expect(spies.onSummarizeStart.mock.calls.length).toBeGreaterThanOrEqual(1);
    console.log(
      `  Tight context: start=${spies.onSummarizeStart.mock.calls.length}, complete=${spies.onSummarizeComplete.mock.calls.length}`,
    );
  });
});

// ---------------------------------------------------------------------------
// OpenAI Tests
// ---------------------------------------------------------------------------

const hasOpenAI = process.env.OPENAI_API_KEY != null && process.env.OPENAI_API_KEY !== 'test';
(hasOpenAI ? describe : describe.skip)('OpenAI Summarization E2E (LibreChat)', () => {
  const instructions =
    'You are a helpful math tutor. Use the calculator tool for ALL computations. Keep responses concise.';

  test('multi-turn with cross-run summary continuity', async () => {
    const spies = createSpies();
    const tokenCounter = await createTokenCounter();
    const conversationPayload = [];

    const addTurn = async (userMsg, maxTokens) => {
      conversationPayload.push({ role: 'user', content: userMsg });
      const result = await runFullTurn({
        payload: conversationPayload,
        agentProvider: Providers.OPENAI,
        summarizationProvider: Providers.OPENAI,
        summarizationModel: 'gpt-4.1-mini',
        maxContextTokens: maxTokens,
        instructions,
        spies,
        tokenCounter,
      });
      conversationPayload.push({ role: 'assistant', content: getLastContent(result.runMessages) });
      return result;
    };

    await addTurn('What is 1234 * 5678? Calculator.', 2000);
    console.log(`  T1: ${conversationPayload.length} entries`);

    await addTurn('Compute sqrt(7006652) with calculator.', 1500);
    console.log(`  T2: ${conversationPayload.length} entries`);

    await addTurn('Calculate 99*101 and 2^15. Calculator for each.', 1200);
    console.log(`  T3: ${conversationPayload.length} entries`);

    await addTurn('What is 314159 * 271828? Calculator. Remind me of all prior results.', 800);
    console.log(`  T4: ${conversationPayload.length} entries`);

    if (spies.onSummarizeStart.mock.calls.length === 0) {
      await addTurn('Calculate 999999 / 7. Calculator.', 600);
      console.log(`  T5: ${conversationPayload.length} entries`);
    }

    if (spies.onSummarizeStart.mock.calls.length === 0) {
      await addTurn('What is 42 + 58? Calculator.', 400);
      console.log(`  T6: ${conversationPayload.length} entries`);
    }

    if (spies.onSummarizeStart.mock.calls.length === 0) {
      await addTurn('Calculate 7 * 13. Calculator.', 300);
      console.log(`  T7: ${conversationPayload.length} entries`);
    }

    if (spies.onSummarizeStart.mock.calls.length === 0) {
      await addTurn('What is 100 - 37? Calculator.', 200);
      console.log(`  T8: ${conversationPayload.length} entries`);
    }

    expect(spies.onSummarizeStart.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(spies.onSummarizeComplete.mock.calls.length).toBeGreaterThanOrEqual(1);

    const complete = spies.onSummarizeComplete.mock.calls[0][0];
    expect(complete.summary.text.length).toBeGreaterThan(10);
    expect(complete.summary.tokenCount).toBeGreaterThan(0);
    expect(complete.summary.rangeHash).toBeDefined();
    expect(complete.summary.summaryVersion).toBeGreaterThanOrEqual(1);
    expect(complete.summary.provider).toBe(Providers.OPENAI);

    console.log(
      `  OpenAI summary: version=${complete.summary.summaryVersion}, tokens=${complete.summary.tokenCount}`,
    );

    // Cross-run: pass summary to next run via formatAgentMessages
    const summaryBlock = complete.summary;
    const crossRunPayload = [
      {
        role: 'assistant',
        content: [
          { type: 'summary', text: summaryBlock.text, tokenCount: summaryBlock.tokenCount },
        ],
      },
      conversationPayload[conversationPayload.length - 2],
      conversationPayload[conversationPayload.length - 1],
      { role: 'user', content: 'What was the first number we calculated? Verify with calculator.' },
    ];

    spies.onSummarizeStart.mockClear();
    spies.onSummarizeComplete.mockClear();

    const crossRun = await runFullTurn({
      payload: crossRunPayload,
      agentProvider: Providers.OPENAI,
      summarizationProvider: Providers.OPENAI,
      summarizationModel: 'gpt-4.1-mini',
      maxContextTokens: 2000,
      instructions,
      spies,
      tokenCounter,
    });

    expect(crossRun.runMessages.length).toBeGreaterThan(0);
    console.log(`  Cross-run: ${crossRun.runMessages.length} messages`);
  });
});

// ---------------------------------------------------------------------------
// Cross-provider: Anthropic agent, OpenAI summarizer
// ---------------------------------------------------------------------------

const hasBothProviders = hasAnthropic && hasOpenAI;
(hasBothProviders ? describe : describe.skip)(
  'Cross-provider Summarization E2E (LibreChat)',
  () => {
    const instructions =
      'You are a math assistant. Use the calculator for every computation. Be brief.';

    test('Anthropic agent with OpenAI summarizer', async () => {
      const spies = createSpies();
      const tokenCounter = await createTokenCounter();
      const conversationPayload = [];

      const addTurn = async (userMsg, maxTokens) => {
        conversationPayload.push({ role: 'user', content: userMsg });
        const result = await runFullTurn({
          payload: conversationPayload,
          agentProvider: Providers.ANTHROPIC,
          summarizationProvider: Providers.OPENAI,
          summarizationModel: 'gpt-4.1-mini',
          maxContextTokens: maxTokens,
          instructions,
          spies,
          tokenCounter,
        });
        conversationPayload.push({
          role: 'assistant',
          content: getLastContent(result.runMessages),
        });
        return result;
      };

      await addTurn('Compute 54321 * 12345 using calculator.', 800);
      console.log(`  T1: ${conversationPayload.length} entries`);

      await addTurn('Now calculate 670592745 / 99991. Calculator.', 600);
      console.log(`  T2: ${conversationPayload.length} entries`);

      await addTurn('What is sqrt(670592745)? Calculator.', 400);
      console.log(`  T3: ${conversationPayload.length} entries`);

      await addTurn('Compute 2^32 with calculator. List all prior results.', 250);
      console.log(`  T4: ${conversationPayload.length} entries`);

      if (spies.onSummarizeStart.mock.calls.length === 0) {
        await addTurn('13 * 17 * 19 = ? Calculator.', 150);
        console.log(`  T5: ${conversationPayload.length} entries`);
      }

      expect(spies.onSummarizeComplete.mock.calls.length).toBeGreaterThanOrEqual(1);
      const complete = spies.onSummarizeComplete.mock.calls[0][0];

      // Summary should come from OpenAI even though agent is Anthropic
      expect(complete.summary.provider).toBe(Providers.OPENAI);
      expect(complete.summary.model).toBe('gpt-4.1-mini');
      expect(complete.summary.text.length).toBeGreaterThan(10);
      expect(complete.summary.rangeHash).toBeDefined();

      console.log(
        `  Cross-provider summary (${complete.summary.text.length} chars): provider=${complete.summary.provider}`,
      );
    });
  },
);
