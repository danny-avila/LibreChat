jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn(), debug: jest.fn() },
}));
jest.mock('@librechat/api', () => ({
  sendEvent: jest.fn(),
  emitEvent: jest.fn(),
  createToolExecuteHandler: jest.fn(),
  markSummarizationUsage: (usage) => usage,
}));
jest.mock('~/server/services/Files/Citations', () => ({
  processFileCitations: jest.fn(),
}));
jest.mock('~/server/services/Files/Code/process', () => ({
  processCodeOutput: jest.fn(),
  runPreviewFinalize: jest.fn(),
}));
jest.mock('~/server/services/Files/process', () => ({
  saveBase64Image: jest.fn(),
}));

const { ModelEndHandler } = require('../callbacks');

const buildGraph = () => ({
  getAgentContext: () => ({
    provider: 'vertexai',
    clientOptions: { model: 'gemini-3.1-flash-lite-preview' },
  }),
});

describe('ModelEndHandler — Vertex thoughtSignature capture (issue #13006 follow-up)', () => {
  it('maps non-empty signatures onto tool_call_ids in order', async () => {
    const collectedUsage = [];
    const collectedThoughtSignatures = {};
    const handler = new ModelEndHandler(collectedUsage, collectedThoughtSignatures);

    await handler.handle(
      'on_chat_model_end',
      {
        output: {
          usage_metadata: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
          tool_calls: [
            { id: 'tc_a', name: 'a', args: {} },
            { id: 'tc_b', name: 'b', args: {} },
          ],
          additional_kwargs: { signatures: ['SIG_A', '', 'SIG_B'] },
        },
      },
      { ls_model_name: 'gemini-3.1-flash-lite-preview', user_id: 'u1' },
      buildGraph(),
    );

    expect(collectedThoughtSignatures).toEqual({ tc_a: 'SIG_A', tc_b: 'SIG_B' });
    expect(collectedUsage).toHaveLength(1);
  });

  it('accumulates per-id across multiple model_end events (multi-step tool turn)', async () => {
    const collectedUsage = [];
    const collectedThoughtSignatures = {};
    const handler = new ModelEndHandler(collectedUsage, collectedThoughtSignatures);

    await handler.handle(
      'on_chat_model_end',
      {
        output: {
          usage_metadata: { input_tokens: 5, output_tokens: 5, total_tokens: 10 },
          tool_calls: [{ id: 'tc_step1', name: 'a', args: {} }],
          additional_kwargs: { signatures: ['SIG_step1'] },
        },
      },
      { ls_model_name: 'g', user_id: 'u' },
      buildGraph(),
    );
    await handler.handle(
      'on_chat_model_end',
      {
        output: {
          usage_metadata: { input_tokens: 5, output_tokens: 5, total_tokens: 10 },
          tool_calls: [{ id: 'tc_step2', name: 'b', args: {} }],
          additional_kwargs: { signatures: ['SIG_step2'] },
        },
      },
      { ls_model_name: 'g', user_id: 'u' },
      buildGraph(),
    );

    expect(collectedThoughtSignatures).toEqual({
      tc_step1: 'SIG_step1',
      tc_step2: 'SIG_step2',
    });
  });

  it('is a no-op for signatures when collectedThoughtSignatures is null', async () => {
    const collectedUsage = [];
    const handler = new ModelEndHandler(collectedUsage, null);

    await handler.handle(
      'on_chat_model_end',
      {
        output: {
          usage_metadata: { input_tokens: 5, output_tokens: 5, total_tokens: 10 },
          tool_calls: [{ id: 'tc1', name: 'a', args: {} }],
          additional_kwargs: { signatures: ['SIG'] },
        },
      },
      { ls_model_name: 'g', user_id: 'u' },
      buildGraph(),
    );

    expect(collectedUsage).toHaveLength(1);
  });

  it('does not store anything when signatures field is missing (non-Vertex providers)', async () => {
    const collectedUsage = [];
    const collectedThoughtSignatures = {};
    const handler = new ModelEndHandler(collectedUsage, collectedThoughtSignatures);

    await handler.handle(
      'on_chat_model_end',
      {
        output: {
          usage_metadata: { input_tokens: 5, output_tokens: 5, total_tokens: 10 },
          tool_calls: [{ id: 'tc1', name: 'a', args: {} }],
          additional_kwargs: {},
        },
      },
      { ls_model_name: 'gpt-4', user_id: 'u' },
      buildGraph(),
    );

    expect(collectedThoughtSignatures).toEqual({});
  });

  it('does not store anything when tool_calls is missing', async () => {
    const collectedUsage = [];
    const collectedThoughtSignatures = {};
    const handler = new ModelEndHandler(collectedUsage, collectedThoughtSignatures);

    await handler.handle(
      'on_chat_model_end',
      {
        output: {
          usage_metadata: { input_tokens: 5, output_tokens: 5, total_tokens: 10 },
          additional_kwargs: { signatures: ['SIG_orphan'] },
        },
      },
      { ls_model_name: 'g', user_id: 'u' },
      buildGraph(),
    );

    expect(collectedThoughtSignatures).toEqual({});
  });

  it('throws when collectedUsage is not an array (existing contract)', () => {
    expect(() => new ModelEndHandler(null)).toThrow('collectedUsage must be an array');
  });
});
