/* eslint-disable @typescript-eslint/no-explicit-any */
// zod.spec.ts
import { z } from 'zod';
import { convertJsonSchemaToZod } from './zod';
import type { JsonSchemaType } from './zod';

describe('convertJsonSchemaToZod', () => {
  describe('primitive types', () => {
    it('should convert string schema', () => {
      const schema: JsonSchemaType = {
        type: 'string',
      };
      const zodSchema = convertJsonSchemaToZod(schema);

      expect(zodSchema?.parse('test')).toBe('test');
      expect(() => zodSchema?.parse(123)).toThrow();
    });

    it('should convert string enum schema', () => {
      const schema: JsonSchemaType = {
        type: 'string',
        enum: ['foo', 'bar', 'baz'],
      };
      const zodSchema = convertJsonSchemaToZod(schema);

      expect(zodSchema?.parse('foo')).toBe('foo');
      expect(() => zodSchema?.parse('invalid')).toThrow();
    });

    it('should convert number schema', () => {
      const schema: JsonSchemaType = {
        type: 'number',
      };
      const zodSchema = convertJsonSchemaToZod(schema);

      expect(zodSchema?.parse(123)).toBe(123);
      expect(() => zodSchema?.parse('123')).toThrow();
    });

    it('should convert boolean schema', () => {
      const schema: JsonSchemaType = {
        type: 'boolean',
      };
      const zodSchema = convertJsonSchemaToZod(schema);

      expect(zodSchema?.parse(true)).toBe(true);
      expect(() => zodSchema?.parse('true')).toThrow();
    });
  });

  describe('array types', () => {
    it('should convert array of strings schema', () => {
      const schema: JsonSchemaType = {
        type: 'array',
        items: { type: 'string' },
      };
      const zodSchema = convertJsonSchemaToZod(schema);

      expect(zodSchema?.parse(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
      expect(() => zodSchema?.parse(['a', 123, 'c'])).toThrow();
    });

    it('should convert array of numbers schema', () => {
      const schema: JsonSchemaType = {
        type: 'array',
        items: { type: 'number' },
      };
      const zodSchema = convertJsonSchemaToZod(schema);

      expect(zodSchema?.parse([1, 2, 3])).toEqual([1, 2, 3]);
      expect(() => zodSchema?.parse([1, '2', 3])).toThrow();
    });
  });

  describe('object types', () => {
    it('should convert simple object schema', () => {
      const schema: JsonSchemaType = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
      };
      const zodSchema = convertJsonSchemaToZod(schema);

      expect(zodSchema?.parse({ name: 'John', age: 30 })).toEqual({ name: 'John', age: 30 });
      expect(() => zodSchema?.parse({ name: 123, age: 30 })).toThrow();
    });

    it('should handle required fields', () => {
      const schema: JsonSchemaType = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name'],
      };
      const zodSchema = convertJsonSchemaToZod(schema);

      expect(zodSchema?.parse({ name: 'John' })).toEqual({ name: 'John' });
      expect(() => zodSchema?.parse({})).toThrow();
    });

    it('should handle nested objects', () => {
      const schema: JsonSchemaType = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              age: { type: 'number' },
            },
            required: ['name'],
          },
        },
        required: ['user'],
      };
      const zodSchema = convertJsonSchemaToZod(schema);

      expect(zodSchema?.parse({ user: { name: 'John', age: 30 } })).toEqual({
        user: { name: 'John', age: 30 },
      });
      expect(() => zodSchema?.parse({ user: { age: 30 } })).toThrow();
    });

    it('should handle objects with arrays', () => {
      const schema: JsonSchemaType = {
        type: 'object',
        properties: {
          names: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      };
      const zodSchema = convertJsonSchemaToZod(schema);

      expect(zodSchema?.parse({ names: ['John', 'Jane'] })).toEqual({ names: ['John', 'Jane'] });
      expect(() => zodSchema?.parse({ names: ['John', 123] })).toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle empty object schema', () => {
      const schema: JsonSchemaType = {
        type: 'object',
        properties: {},
      };
      const zodSchema = convertJsonSchemaToZod(schema);

      expect(zodSchema?.parse({})).toEqual({});
    });

    it('should handle unknown types as unknown', () => {
      const schema = {
        type: 'invalid',
      } as unknown as JsonSchemaType;
      const zodSchema = convertJsonSchemaToZod(schema);

      expect(zodSchema?.parse('anything')).toBe('anything');
      expect(zodSchema?.parse(123)).toBe(123);
    });

    it('should handle empty enum arrays as regular strings', () => {
      const schema: JsonSchemaType = {
        type: 'string',
        enum: [],
      };
      const zodSchema = convertJsonSchemaToZod(schema);

      expect(zodSchema?.parse('test')).toBe('test');
    });
  });

  describe('complex schemas', () => {
    it('should handle complex nested schema', () => {
      const schema: JsonSchemaType = {
        type: 'object',
        properties: {
          id: { type: 'number' },
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              roles: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    permissions: {
                      type: 'array',
                      items: {
                        type: 'string',
                        enum: ['read', 'write', 'admin'],
                      },
                    },
                  },
                  required: ['name', 'permissions'],
                },
              },
            },
            required: ['name', 'roles'],
          },
        },
        required: ['id', 'user'],
      };

      const zodSchema = convertJsonSchemaToZod(schema);

      const validData = {
        id: 1,
        user: {
          name: 'John',
          roles: [
            {
              name: 'moderator',
              permissions: ['read', 'write'],
            },
          ],
        },
      };
      if (zodSchema == null) {
        throw new Error('Zod schema is null');
      }

      expect(zodSchema.parse(validData)).toEqual(validData);
      expect(() =>
        zodSchema.parse({
          id: 1,
          user: {
            name: 'John',
            roles: [
              {
                name: 'moderator',
                permissions: ['invalid'],
              },
            ],
          },
        }),
      ).toThrow();
    });
  });

  // zod.spec.ts
  describe('schema descriptions', () => {
    it('should preserve top-level description', () => {
      const schema: JsonSchemaType = {
        type: 'object',
        description: 'A test schema description',
        properties: {
          name: { type: 'string' },
        },
      };
      const zodSchema = convertJsonSchemaToZod(schema);
      expect(zodSchema?.description).toBe('A test schema description');
    });

    it('should preserve field descriptions', () => {
      const schema: JsonSchemaType = {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The user\'s name',
          },
          age: {
            type: 'number',
            description: 'The user\'s age',
          },
        },
      };
      const zodSchema = convertJsonSchemaToZod(schema);

      const shape = (zodSchema as z.ZodObject<any>).shape;
      expect(shape.name.description).toBe('The user\'s name');
      expect(shape.age.description).toBe('The user\'s age');
    });

    it('should preserve descriptions in nested objects', () => {
      const schema: JsonSchemaType = {
        type: 'object',
        description: 'User record',
        properties: {
          user: {
            type: 'object',
            description: 'User details',
            properties: {
              name: {
                type: 'string',
                description: 'The user\'s name',
              },
              settings: {
                type: 'object',
                description: 'User preferences',
                properties: {
                  theme: {
                    type: 'string',
                    description: 'UI theme preference',
                    enum: ['light', 'dark'],
                  },
                },
              },
            },
          },
        },
      };
      const zodSchema = convertJsonSchemaToZod(schema);

      // Type assertions for better type safety
      const shape = zodSchema instanceof z.ZodObject ? zodSchema.shape : {};
      expect(zodSchema?.description).toBe('User record');

      if ('user' in shape) {
        expect(shape.user.description).toBe('User details');

        const userShape = shape.user instanceof z.ZodObject ? shape.user.shape : {};
        if ('name' in userShape && 'settings' in userShape) {
          expect(userShape.name.description).toBe('The user\'s name');
          expect(userShape.settings.description).toBe('User preferences');

          const settingsShape =
            userShape.settings instanceof z.ZodObject ? userShape.settings.shape : {};
          if ('theme' in settingsShape) {
            expect(settingsShape.theme.description).toBe('UI theme preference');
          }
        }
      }
    });

    it('should preserve descriptions in arrays', () => {
      const schema: JsonSchemaType = {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            description: 'User tags',
            items: {
              type: 'string',
              description: 'Individual tag',
            },
          },
          scores: {
            type: 'array',
            description: 'Test scores',
            items: {
              type: 'number',
              description: 'Individual score',
            },
          },
        },
      };
      const zodSchema = convertJsonSchemaToZod(schema);

      const shape = (zodSchema as z.ZodObject<any>).shape;
      expect(shape.tags.description).toBe('User tags');
      expect(shape.scores.description).toBe('Test scores');
    });

    it('should preserve descriptions in enums', () => {
      const schema: JsonSchemaType = {
        type: 'object',
        properties: {
          role: {
            type: 'string',
            description: 'User role in the system',
            enum: ['admin', 'user', 'guest'],
          },
          status: {
            type: 'string',
            description: 'Account status',
            enum: ['active', 'suspended', 'deleted'],
          },
        },
      };
      const zodSchema = convertJsonSchemaToZod(schema);

      const shape = (zodSchema as z.ZodObject<any>).shape;
      expect(shape.role.description).toBe('User role in the system');
      expect(shape.status.description).toBe('Account status');
    });

    it('should preserve descriptions in a complex schema', () => {
      const schema: JsonSchemaType = {
        type: 'object',
        description: 'User profile configuration',
        properties: {
          basicInfo: {
            type: 'object',
            description: 'Basic user information',
            properties: {
              name: {
                type: 'string',
                description: 'Full name of the user',
              },
              age: {
                type: 'number',
                description: 'User age in years',
              },
            },
            required: ['name'],
          },
          preferences: {
            type: 'object',
            description: 'User preferences',
            properties: {
              notifications: {
                type: 'array',
                description: 'Notification settings',
                items: {
                  type: 'object',
                  description: 'Individual notification preference',
                  properties: {
                    type: {
                      type: 'string',
                      description: 'Type of notification',
                      enum: ['email', 'sms', 'push'],
                    },
                    enabled: {
                      type: 'boolean',
                      description: 'Whether this notification is enabled',
                    },
                  },
                },
              },
              theme: {
                type: 'string',
                description: 'UI theme preference',
                enum: ['light', 'dark', 'system'],
              },
            },
          },
        },
      };

      const zodSchema = convertJsonSchemaToZod(schema);

      // Test top-level description
      expect(zodSchema?.description).toBe('User profile configuration');

      const shape = zodSchema instanceof z.ZodObject ? zodSchema.shape : {};

      // Test basic info descriptions
      if ('basicInfo' in shape) {
        expect(shape.basicInfo.description).toBe('Basic user information');
        const basicInfoShape = shape.basicInfo instanceof z.ZodObject ? shape.basicInfo.shape : {};

        if ('name' in basicInfoShape && 'age' in basicInfoShape) {
          expect(basicInfoShape.name.description).toBe('Full name of the user');
          expect(basicInfoShape.age.description).toBe('User age in years');
        }
      }

      // Test preferences descriptions
      if ('preferences' in shape) {
        expect(shape.preferences.description).toBe('User preferences');
        const preferencesShape =
          shape.preferences instanceof z.ZodObject ? shape.preferences.shape : {};

        if ('notifications' in preferencesShape && 'theme' in preferencesShape) {
          expect(preferencesShape.notifications.description).toBe('Notification settings');
          expect(preferencesShape.theme.description).toBe('UI theme preference');
        }
      }
    });
  });

  describe('additionalProperties handling', () => {
    it('should allow any additional properties when additionalProperties is true', () => {
      const schema: JsonSchemaType = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        additionalProperties: true,
      };
      const zodSchema = convertJsonSchemaToZod(schema);

      // Should accept the defined property
      expect(zodSchema?.parse({ name: 'John' })).toEqual({ name: 'John' });

      // Should also accept additional properties of any type
      expect(zodSchema?.parse({ name: 'John', age: 30 })).toEqual({ name: 'John', age: 30 });
      expect(zodSchema?.parse({ name: 'John', isActive: true })).toEqual({
        name: 'John',
        isActive: true,
      });
      expect(zodSchema?.parse({ name: 'John', tags: ['tag1', 'tag2'] })).toEqual({
        name: 'John',
        tags: ['tag1', 'tag2'],
      });
    });

    it('should validate additional properties according to schema when additionalProperties is an object', () => {
      const schema: JsonSchemaType = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        additionalProperties: { type: 'number' },
      };
      const zodSchema = convertJsonSchemaToZod(schema);

      // Should accept the defined property
      expect(zodSchema?.parse({ name: 'John' })).toEqual({ name: 'John' });

      // Should accept additional properties that match the additionalProperties schema
      expect(zodSchema?.parse({ name: 'John', age: 30, score: 100 })).toEqual({
        name: 'John',
        age: 30,
        score: 100,
      });

      // Should reject additional properties that don't match the additionalProperties schema
      expect(() => zodSchema?.parse({ name: 'John', isActive: true })).toThrow();
      expect(() => zodSchema?.parse({ name: 'John', tags: ['tag1', 'tag2'] })).toThrow();
    });

    it('should strip additional properties when additionalProperties is false or not specified', () => {
      const schema: JsonSchemaType = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        additionalProperties: false,
      };
      const zodSchema = convertJsonSchemaToZod(schema);

      // Should accept the defined properties
      expect(zodSchema?.parse({ name: 'John', age: 30 })).toEqual({ name: 'John', age: 30 });

      // Current implementation strips additional properties when additionalProperties is false
      const objWithExtra = { name: 'John', age: 30, isActive: true };
      expect(zodSchema?.parse(objWithExtra)).toEqual({ name: 'John', age: 30 });

      // Test with additionalProperties not specified (should behave the same)
      const schemaWithoutAdditionalProps: JsonSchemaType = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
      };
      const zodSchemaWithoutAdditionalProps = convertJsonSchemaToZod(schemaWithoutAdditionalProps);

      expect(zodSchemaWithoutAdditionalProps?.parse({ name: 'John', age: 30 })).toEqual({
        name: 'John',
        age: 30,
      });

      // Current implementation strips additional properties when additionalProperties is not specified
      const objWithExtra2 = { name: 'John', age: 30, isActive: true };
      expect(zodSchemaWithoutAdditionalProps?.parse(objWithExtra2)).toEqual({
        name: 'John',
        age: 30,
      });
    });

    it('should handle complex nested objects with additionalProperties', () => {
      const schema: JsonSchemaType = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              profile: {
                type: 'object',
                properties: {
                  bio: { type: 'string' },
                },
                additionalProperties: true,
              },
            },
            additionalProperties: { type: 'string' },
          },
        },
        additionalProperties: false,
      };
      const zodSchema = convertJsonSchemaToZod(schema);

      const validData = {
        user: {
          name: 'John',
          profile: {
            bio: 'Developer',
            location: 'New York', // Additional property allowed in profile
            website: 'https://example.com', // Additional property allowed in profile
          },
          role: 'admin', // Additional property of type string allowed in user
          level: 'senior', // Additional property of type string allowed in user
        },
      };

      expect(zodSchema?.parse(validData)).toEqual(validData);

      // Current implementation strips additional properties at the top level
      // when additionalProperties is false
      const dataWithExtraTopLevel = {
        user: { name: 'John' },
        extraField: 'not allowed', // This should be stripped
      };
      expect(zodSchema?.parse(dataWithExtraTopLevel)).toEqual({ user: { name: 'John' } });

      // Should reject additional properties in user that don't match the string type
      expect(() =>
        zodSchema?.parse({
          user: {
            name: 'John',
            age: 30, // Not a string
          },
        }),
      ).toThrow();
    });
  });

  describe('empty object handling', () => {
    it('should return undefined for empty object schemas when allowEmptyObject is false', () => {
      const emptyObjectSchemas = [
        { type: 'object' as const },
        { type: 'object' as const, properties: {} },
      ];

      emptyObjectSchemas.forEach((schema) => {
        expect(convertJsonSchemaToZod(schema, { allowEmptyObject: false })).toBeUndefined();
      });
    });

    it('should return zod schema for empty object schemas when allowEmptyObject is true', () => {
      const emptyObjectSchemas = [
        { type: 'object' as const },
        { type: 'object' as const, properties: {} },
      ];

      emptyObjectSchemas.forEach((schema) => {
        const result = convertJsonSchemaToZod(schema, { allowEmptyObject: true });
        expect(result).toBeDefined();
        expect(result instanceof z.ZodObject).toBeTruthy();
      });
    });

    it('should return zod schema for empty object schemas by default', () => {
      const emptyObjectSchemas = [
        { type: 'object' as const },
        { type: 'object' as const, properties: {} },
      ];

      emptyObjectSchemas.forEach((schema) => {
        const result = convertJsonSchemaToZod(schema);
        expect(result).toBeDefined();
        expect(result instanceof z.ZodObject).toBeTruthy();
      });
    });

    it('should still convert non-empty object schemas regardless of allowEmptyObject setting', () => {
      const schema: JsonSchemaType = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };

      const resultWithFlag = convertJsonSchemaToZod(schema, { allowEmptyObject: false });
      const resultWithoutFlag = convertJsonSchemaToZod(schema);

      expect(resultWithFlag).toBeDefined();
      expect(resultWithoutFlag).toBeDefined();
      expect(resultWithFlag instanceof z.ZodObject).toBeTruthy();
      expect(resultWithoutFlag instanceof z.ZodObject).toBeTruthy();
    });
  });
});
