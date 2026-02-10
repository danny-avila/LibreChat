const OpenAIClient = require('../OpenAIClient');

describe('OpenAIClient buildResponsesRequest', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('always includes vector_store_ids using default fallback', () => {
    const client = new OpenAIClient('test-key', { codeCanFileId: 'file-test' });
    const req = client.buildResponsesRequest({ model: 'gpt-5' }, [{ content: 'hi' }], false);
    expect(req.tool_resources.file_search.vector_store_ids).toEqual([
      'vs_693860848bc48191bccb7c1d197f488f',
    ]);
    expect(req.tools).toEqual([{ type: 'file_search' }]);
  });
});
