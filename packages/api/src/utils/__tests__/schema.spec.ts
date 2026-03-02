import { sanitizeSchemaMetadata, sanitizeToolSchema } from '../schema';
import type { JsonSchemaType } from '~/types';

describe('sanitizeSchemaMetadata', () => {
  it('removes $schema field from top-level object', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
    };

    const result = sanitizeSchemaMetadata(schema);

    expect(result).not.toHaveProperty('$schema');
    expect(result).toHaveProperty('type', 'object');
    expect(result).toHaveProperty('properties');
  });

  it('removes nested $schema fields', () => {
    const schema = {
      $schema: 'root',
      type: 'object',
      properties: {
        nested: {
          $schema: 'nested',
          type: 'object',
          properties: {
            deep: {
              $schema: 'deep',
              type: 'string',
            },
          },
        },
      },
    };

    const result = sanitizeSchemaMetadata(schema);

    expect(result).not.toHaveProperty('$schema');
    expect(result.properties?.nested).not.toHaveProperty('$schema');
    expect(result.properties?.nested?.properties?.deep).not.toHaveProperty('$schema');
  });

  it('handles arrays correctly', () => {
    const schema = [
      { $schema: 'item1', type: 'string' },
      { $schema: 'item2', type: 'number' },
    ];

    const result = sanitizeSchemaMetadata(schema);

    expect(result[0]).not.toHaveProperty('$schema');
    expect(result[1]).not.toHaveProperty('$schema');
    expect(result[0]).toHaveProperty('type', 'string');
    expect(result[1]).toHaveProperty('type', 'number');
  });

  it('preserves other properties', () => {
    const schema = {
      $schema: 'test',
      type: 'object',
      title: 'Test Schema',
      description: 'A test schema',
      required: ['name'],
      properties: {
        name: {
          type: 'string',
          minLength: 1,
        },
      },
    };

    const result = sanitizeSchemaMetadata(schema);

    expect(result).toEqual({
      type: 'object',
      title: 'Test Schema',
      description: 'A test schema',
      required: ['name'],
      properties: {
        name: {
          type: 'string',
          minLength: 1,
        },
      },
    });
  });

  it('returns primitive values unchanged', () => {
    expect(sanitizeSchemaMetadata('string')).toBe('string');
    expect(sanitizeSchemaMetadata(123)).toBe(123);
    expect(sanitizeSchemaMetadata(true)).toBe(true);
    expect(sanitizeSchemaMetadata(null)).toBe(null);
  });
});

describe('sanitizeToolSchema', () => {
  it('returns undefined for null/undefined input', () => {
    expect(sanitizeToolSchema(undefined)).toBeUndefined();
    expect(sanitizeToolSchema(null as unknown as JsonSchemaType)).toBeNull();
  });

  it('sanitizes a valid JSON schema', () => {
    const schema: JsonSchemaType = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query',
        },
      },
      required: ['query'],
    } as JsonSchemaType;

    const result = sanitizeToolSchema(schema);

    expect(result).not.toHaveProperty('$schema');
    expect(result).toHaveProperty('type', 'object');
    expect(result?.properties?.query).toHaveProperty('type', 'string');
  });
});
