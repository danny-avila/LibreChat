import { z } from 'zod';

export type JsonSchemaType = {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  enum?: string[];
  items?: JsonSchemaType;
  properties?: Record<string, JsonSchemaType>;
  required?: string[];
  description?: string;
};

export function convertJsonSchemaToZod(schema: JsonSchemaType): z.ZodType {
  let zodSchema: z.ZodType;

  // Handle primitive types
  if (schema.type === 'string') {
    if (Array.isArray(schema.enum) && schema.enum.length > 0) {
      const [first, ...rest] = schema.enum;
      zodSchema = z.enum([first, ...rest] as [string, ...string[]]);
    } else {
      zodSchema = z.string();
    }
  } else if (schema.type === 'number') {
    zodSchema = z.number();
  } else if (schema.type === 'boolean') {
    zodSchema = z.boolean();
  } else if (schema.type === 'array' && schema.items !== undefined) {
    const itemSchema = convertJsonSchemaToZod(schema.items);
    zodSchema = z.array(itemSchema);
  } else if (schema.type === 'object') {
    const shape: Record<string, z.ZodType> = {};
    const properties = schema.properties ?? {};

    for (const [key, value] of Object.entries(properties)) {
      let fieldSchema = convertJsonSchemaToZod(value);
      if (value.description != null && value.description !== '') {
        fieldSchema = fieldSchema.describe(value.description);
      }
      shape[key] = fieldSchema;
    }

    let objectSchema = z.object(shape);

    if (Array.isArray(schema.required) && schema.required.length > 0) {
      const partial = Object.fromEntries(
        Object.entries(shape).map(([key, value]) => [
          key,
          schema.required?.includes(key) === true ? value : value.optional(),
        ]),
      );
      objectSchema = z.object(partial);
    } else {
      objectSchema = objectSchema.partial();
    }
    zodSchema = objectSchema;
  } else {
    zodSchema = z.unknown();
  }

  // Add description if present
  if (schema.description != null && schema.description !== '') {
    zodSchema = zodSchema.describe(schema.description);
  }

  return zodSchema;
}
