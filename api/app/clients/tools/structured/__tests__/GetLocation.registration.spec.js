const { Tool } = require('@librechat/agents/langchain/tools');
const GetLocation = require('../GetLocation');

describe('get_location tool registration', () => {
  it('GetLocation is a Tool subclass so loadAndFormatTools discovers it', () => {
    expect(GetLocation.prototype instanceof Tool).toBe(true);
  });

  it('can be instantiated with override for discovery without request context', () => {
    const tool = new GetLocation({ override: true });
    expect(tool.name).toBe('get_location');
    expect(tool.schema).toBeDefined();
  });

  it('has a plain-object schema compatible with loadAndFormatTools (non-Zod)', () => {
    const tool = new GetLocation({ override: true });
    expect(tool.schema).toEqual({ type: 'object', properties: {}, required: [] });
  });
});
