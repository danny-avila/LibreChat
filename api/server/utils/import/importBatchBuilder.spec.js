const {
  ContentFilterError,
  contentFilterBlockResponse,
  extractConversationImportContent,
  inspectContent,
} = require('@librechat/api');
const { EModelEndpoint } = require('librechat-data-provider');
const { bulkIncrementTagCounts, bulkSaveConvos, bulkSaveMessages } = require('~/models');
const { ImportBatchBuilder } = require('./importBatchBuilder');

jest.mock('~/models', () => ({
  bulkIncrementTagCounts: jest.fn(),
  bulkSaveConvos: jest.fn(),
  bulkSaveMessages: jest.fn(),
}));

const pattern = {
  id: 'import-secret',
  label: 'restricted import value',
  regex: 'IMPORT-SECRET',
};

function filtersFor(source, fields) {
  return {
    [source]: {
      pii: {
        fields,
        starterPatterns: [],
        customPatterns: [pattern],
      },
    },
  };
}

function createBuilder(filters, { conversation = {}, message = {} } = {}) {
  const builder = new ImportBatchBuilder('user-123', undefined, filters);
  builder.startConversation(EModelEndpoint.openAI);
  builder.saveMessage({
    sender: 'user',
    isCreatedByUser: true,
    text: 'safe message',
    ...message,
  });
  builder.finishConversation('safe title', new Date('2026-01-01T00:00:00.000Z'), conversation);
  return builder;
}

describe('ImportBatchBuilder content filtering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    bulkIncrementTagCounts.mockResolvedValue();
    bulkSaveConvos.mockResolvedValue();
    bulkSaveMessages.mockResolvedValue();
  });

  it('preserves default-off imports without inspecting normalized content', async () => {
    const builder = createBuilder(undefined, {
      conversation: {
        promptPrefix: 'IMPORT-SECRET',
        instructions: 'IMPORT-SECRET',
      },
      message: {
        sender: 'IMPORT-SECRET',
        text: 'IMPORT-SECRET',
        content: [{ text: 'IMPORT-SECRET' }],
      },
    });

    await expect(builder.saveBatch()).resolves.toBeUndefined();

    expect(bulkSaveConvos).toHaveBeenCalledTimes(1);
    expect(bulkSaveMessages).toHaveBeenCalledTimes(1);
    expect(bulkIncrementTagCounts).toHaveBeenCalledTimes(1);
  });

  it('blocks opaque imported content before starting any bulk write', async () => {
    const opaqueValue = 'data:image/png;base64,IMPORT-OPAQUE-DO-NOT-ECHO';
    const builder = createBuilder(
      {
        files: {
          pii: {
            fields: ['content'],
            uninspectable: 'block',
          },
        },
      },
      {
        message: {
          content: [{ type: 'image_url', image_url: { url: opaqueValue } }],
        },
      },
    );

    let thrown;
    try {
      await builder.saveBatch();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({
      code: 'content_filter_uninspectable',
      statusCode: 400,
      body: {
        error: 'content_filter_uninspectable',
        source: 'file',
        field: 'content',
      },
    });

    expect(bulkSaveConvos).not.toHaveBeenCalled();
    expect(bulkSaveMessages).not.toHaveBeenCalled();
    expect(bulkIncrementTagCounts).not.toHaveBeenCalled();
    expect(JSON.stringify(thrown.body)).not.toContain(opaqueValue);
  });

  it('honors opaque import allow/default behavior and file-field granularity', async () => {
    const builder = createBuilder(
      {
        files: {
          pii: {
            fields: ['extracted_text'],
            uninspectable: 'block',
          },
        },
      },
      {
        message: {
          content: [
            {
              type: 'image_url',
              image_url: { url: 'https://example.test/imported-image.png' },
            },
          ],
        },
      },
    );

    await expect(builder.saveBatch()).resolves.toBeUndefined();
    expect(bulkSaveMessages).toHaveBeenCalledTimes(1);
  });

  it('blocks imported file data for the selected derived-text field', async () => {
    const builder = createBuilder(
      {
        files: {
          pii: {
            fields: ['extracted_text'],
            uninspectable: 'block',
          },
        },
      },
      {
        message: {
          content: [{ type: 'input_file', file_data: 'opaque-imported-file' }],
        },
      },
    );

    await expect(builder.saveBatch()).rejects.toMatchObject({
      body: {
        error: 'content_filter_uninspectable',
        source: 'file',
        field: 'extracted_text',
      },
    });
    expect(bulkSaveMessages).not.toHaveBeenCalled();
  });

  it('fails closed before bulk writes when nested import inspection exhausts its budget', async () => {
    const builder = createBuilder(filtersFor('messages', ['content_part']), {
      message: {
        content: [
          {
            type: 'vendor_content',
            payload: Array.from({ length: 5000 }, (_, index) => `submitted-${index}`),
          },
        ],
      },
    });

    await expect(builder.saveBatch()).rejects.toMatchObject({
      code: 'content_filter_uninspectable',
      statusCode: 400,
      body: {
        error: 'content_filter_uninspectable',
        source: 'message',
        field: 'content_part',
      },
    });
    expect(bulkSaveConvos).not.toHaveBeenCalled();
    expect(bulkSaveMessages).not.toHaveBeenCalled();
    expect(bulkIncrementTagCounts).not.toHaveBeenCalled();
  });

  it('allows exhausted nested import content when only message text is selected', async () => {
    const builder = createBuilder(filtersFor('messages', ['text']), {
      message: {
        text: 'safe message',
        content: [
          {
            type: 'vendor_content',
            payload: Array.from({ length: 5000 }, (_, index) => `submitted-${index}`),
          },
        ],
      },
    });

    await expect(builder.saveBatch()).resolves.toBeUndefined();
    expect(bulkSaveMessages).toHaveBeenCalledTimes(1);
  });

  it('continues inspecting later imported messages after unselected traversal exhaustion', async () => {
    const builder = createBuilder(filtersFor('messages', ['text']), {
      message: {
        text: 'safe message',
        content: [
          {
            type: 'vendor_content',
            payload: Array.from({ length: 5000 }, (_, index) => `submitted-${index}`),
          },
        ],
      },
    });
    builder.saveMessage({
      sender: 'user',
      isCreatedByUser: true,
      text: 'IMPORT-SECRET',
    });

    await expect(builder.saveBatch()).rejects.toMatchObject({
      body: {
        error: 'content_filter_block',
        source: 'message',
        field: 'text',
      },
    });
    expect(bulkSaveMessages).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'message text',
      filters: filtersFor('messages', ['text']),
      input: { message: { text: 'IMPORT-SECRET' } },
      source: 'message',
      field: 'text',
    },
    {
      name: 'message sender',
      filters: filtersFor('messages', ['name']),
      input: { message: { sender: 'IMPORT-SECRET' } },
      source: 'message',
      field: 'name',
    },
    {
      name: 'structured message content',
      filters: filtersFor('messages', ['content_part']),
      input: { message: { content: [{ text: 'IMPORT-SECRET' }] } },
      source: 'message',
      field: 'content_part',
    },
    {
      name: 'message summary',
      filters: filtersFor('messages', ['summary']),
      input: { message: { summary: 'IMPORT-SECRET' } },
      source: 'message',
      field: 'summary',
    },
    {
      name: 'nested message feedback',
      filters: filtersFor('feedback', ['text']),
      input: { message: { feedback: { text: 'IMPORT-SECRET' } } },
      source: 'feedback',
      field: 'text',
    },
    {
      name: 'message attachment',
      filters: filtersFor('messages', ['attachment_reference']),
      input: { message: { attachments: [{ filename: 'IMPORT-SECRET.txt' }] } },
      source: 'message',
      field: 'attachment_reference',
    },
    {
      name: 'tool arguments',
      filters: filtersFor('toolArguments', ['arguments']),
      input: {
        message: {
          content: [{ tool_call: { arguments: { token: 'IMPORT-SECRET' } } }],
        },
      },
      source: 'tool_argument',
      field: 'arguments',
    },
    {
      name: 'conversation title',
      filters: filtersFor('conversationTitles', ['title']),
      title: 'IMPORT-SECRET',
      source: 'conversation_title',
      field: 'title',
    },
    {
      name: 'prompt metadata',
      filters: filtersFor('prompts', ['preset_text']),
      input: { conversation: { promptPrefix: 'IMPORT-SECRET' } },
      source: 'prompt',
      field: 'preset_text',
    },
    {
      name: 'agent instruction metadata',
      filters: filtersFor('agentInstructions', ['instructions']),
      input: { conversation: { instructions: 'IMPORT-SECRET' } },
      source: 'agent_instruction',
      field: 'instructions',
    },
    {
      name: 'model stop sequence',
      filters: filtersFor('modelParameters', ['stop']),
      input: { conversation: { stop: ['IMPORT-SECRET'] } },
      source: 'model_parameter',
      field: 'stop',
    },
    {
      name: 'nested provider request field',
      filters: filtersFor('modelParameters', ['request_fields']),
      input: {
        conversation: {
          additionalModelRequestFields: { thinking: { mode: 'IMPORT-SECRET' } },
        },
      },
      source: 'model_parameter',
      field: 'request_fields',
    },
    {
      name: 'arbitrary persisted provider option',
      filters: filtersFor('modelParameters', ['request_fields']),
      input: {
        conversation: {
          model_parameters: { vendorOption: 'IMPORT-SECRET' },
        },
      },
      source: 'model_parameter',
      field: 'request_fields',
    },
    {
      name: 'nested imported response format',
      filters: filtersFor('modelParameters', ['response_format']),
      input: {
        conversation: {
          options: {
            response_format: { json_schema: { description: 'IMPORT-SECRET' } },
          },
        },
      },
      source: 'model_parameter',
      field: 'response_format',
    },
  ])('blocks normalized $name before starting any bulk write', async (testCase) => {
    const builder = createBuilder(testCase.filters, testCase.input);
    if (testCase.title != null) {
      builder.conversations[0].title = testCase.title;
    }

    await expect(builder.saveBatch()).rejects.toMatchObject({
      code: 'content_filter_block',
      statusCode: 400,
      body: {
        error: 'content_filter_block',
        source: testCase.source,
        field: testCase.field,
      },
    });

    expect(bulkSaveConvos).not.toHaveBeenCalled();
    expect(bulkSaveMessages).not.toHaveBeenCalled();
    expect(bulkIncrementTagCounts).not.toHaveBeenCalled();
  });

  it('does not classify unregistered raw export metadata heuristically', async () => {
    const builder = createBuilder(filtersFor('prompts', ['text']), {
      conversation: { arbitraryRawExportField: 'IMPORT-SECRET' },
    });

    await expect(builder.saveBatch()).resolves.toBeUndefined();
    expect(bulkSaveConvos).toHaveBeenCalledTimes(1);
  });

  it('honors configured field granularity for normalized imported messages', async () => {
    const builder = createBuilder(filtersFor('messages', ['text']), {
      message: {
        sender: 'IMPORT-SECRET',
        text: 'safe message',
        content: [{ text: 'IMPORT-SECRET' }],
      },
    });

    await expect(builder.saveBatch()).resolves.toBeUndefined();
    expect(bulkSaveMessages).toHaveBeenCalledTimes(1);
  });

  it('throws the shared metadata-safe content filter error', () => {
    const finding = inspectContent(
      extractConversationImportContent({
        conversations: [{ title: 'IMPORT-SECRET' }],
        messages: [],
      }),
      { filters: filtersFor('conversationTitles', ['title']) },
    );

    expect(finding).not.toBeNull();
    const error = new ContentFilterError(finding);
    expect(error.body).toEqual(contentFilterBlockResponse(finding));
    expect(error.body).not.toHaveProperty('detectorId');
    expect(error.body).not.toHaveProperty('ruleId');
    expect(error.body).not.toHaveProperty('fragmentPath');
  });
});
