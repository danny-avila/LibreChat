const { z } = require('zod');

describe('buildAssistantJsonSchema', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('removes the top-level $schema field from real conversions', () => {
    jest.isolateModules(() => {
      const { buildAssistantJsonSchema } = require('../toAssistantSchema');
      const schema = buildAssistantJsonSchema(
        z.object({ id: z.string(), count: z.number().optional() }),
      );

      expect(schema.$schema).toBeUndefined();
      expect(schema.type).toBe('object');
      expect(schema.properties.id).toBeDefined();
    });
  });

  it('strips nested $schema entries returned by the converter', () => {
    jest.doMock('zod-to-json-schema', () => ({
      zodToJsonSchema: jest.fn(() => ({
        $schema: 'root',
        nested: {
          $schema: 'inner',
          value: {
            $schema: 'deep',
            type: 'string',
          },
        },
        arr: [
          {
            $schema: 'child',
            type: 'number',
          },
        ],
      })),
    }));

    jest.isolateModules(() => {
      const { buildAssistantJsonSchema } = require('../toAssistantSchema');
      const schema = buildAssistantJsonSchema(z.any());

      expect(schema).toEqual({
        nested: {
          value: {
            type: 'string',
          },
        },
        arr: [
          {
            type: 'number',
          },
        ],
      });
    });

    jest.dontMock('zod-to-json-schema');
  });
});
