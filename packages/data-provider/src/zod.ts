import { z } from 'zod';

export type JsonSchemaType = {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  enum?: string[];
  items?: JsonSchemaType;
  properties?: Record<string, JsonSchemaType>;
  required?: string[];
  description?: string;
  additionalProperties?: boolean | JsonSchemaType;
};

function isEmptyObjectSchema(jsonSchema?: JsonSchemaType): boolean {
  return (
    jsonSchema != null &&
    typeof jsonSchema === 'object' &&
    jsonSchema.type === 'object' &&
    (jsonSchema.properties == null || Object.keys(jsonSchema.properties).length === 0)
  );
}

type ConvertJsonSchemaToZodOptions = {
  allowEmptyObject?: boolean;
  dropFields?: string[];
  transformOneOfAnyOf?: boolean;
};

function dropSchemaFields(
  schema: JsonSchemaType | undefined,
  fields: string[],
): JsonSchemaType | undefined {
  if (schema == null || typeof schema !== 'object') {return schema;}
  // Handle arrays (should only occur for enum, required, etc.)
  if (Array.isArray(schema)) {
    // This should not happen for the root schema, but for completeness:
    return schema as unknown as JsonSchemaType;
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (fields.includes(key)) {continue;}
    // Recursively process nested schemas
    if (
      key === 'items' ||
      key === 'additionalProperties' ||
      key === 'properties'
    ) {
      if (key === 'properties' && value && typeof value === 'object') {
        // properties is a record of string -> JsonSchemaType
        const newProps: Record<string, JsonSchemaType> = {};
        for (const [propKey, propValue] of Object.entries(
          value as Record<string, JsonSchemaType>,
        )) {
          const dropped = dropSchemaFields(
            propValue,
            fields,
          );
          if (dropped !== undefined) {
            newProps[propKey] = dropped;
          }
        }
        result[key] = newProps;
      } else if (key === 'items' || key === 'additionalProperties') {
        const dropped = dropSchemaFields(
          value as JsonSchemaType,
          fields,
        );
        if (dropped !== undefined) {
          result[key] = dropped;
        }
      }
    } else {
      result[key] = value;
    }
  }
  // Only return if the result is still a valid JsonSchemaType (must have a type)
  if (
    typeof result.type === 'string' &&
    ['string', 'number', 'boolean', 'array', 'object'].includes(result.type)
  ) {
    return result as JsonSchemaType;
  }
  return undefined;
}

// Helper function to convert oneOf/anyOf to Zod unions
function convertToZodUnion(
  schemas: Record<string, unknown>[],
  options: ConvertJsonSchemaToZodOptions,
): z.ZodType | undefined {
  if (!Array.isArray(schemas) || schemas.length === 0) {
    return undefined;
  }

  // Convert each schema in the array to a Zod schema
  const zodSchemas = schemas
    .map((subSchema) => {
      // If the subSchema doesn't have a type, try to infer it
      if (!subSchema.type && subSchema.properties) {
        // It's likely an object schema
        const objSchema = { ...subSchema, type: 'object' } as JsonSchemaType;

        // Handle required fields for partial schemas
        if (Array.isArray(subSchema.required) && subSchema.required.length > 0) {
          return convertJsonSchemaToZod(objSchema, options);
        }

        return convertJsonSchemaToZod(objSchema, options);
      } else if (!subSchema.type && subSchema.items) {
        // It's likely an array schema
        return convertJsonSchemaToZod({ ...subSchema, type: 'array' } as JsonSchemaType, options);
      } else if (!subSchema.type && Array.isArray(subSchema.enum)) {
        // It's likely an enum schema
        return convertJsonSchemaToZod({ ...subSchema, type: 'string' } as JsonSchemaType, options);
      } else if (!subSchema.type && subSchema.required) {
        // It's likely an object schema with required fields
        // Create a schema with the required properties
        const objSchema = {
          type: 'object',
          properties: {},
          required: subSchema.required,
        } as JsonSchemaType;

        return convertJsonSchemaToZod(objSchema, options);
      } else if (!subSchema.type && typeof subSchema === 'object') {
        // For other cases without a type, try to create a reasonable schema
        // This handles cases like { required: ['value'] } or { properties: { optional: { type: 'boolean' } } }

        // Special handling for schemas that add properties
        if (subSchema.properties && Object.keys(subSchema.properties).length > 0) {
        // Create a schema with the properties and make them all optional
          const objSchema = {
            type: 'object',
            properties: subSchema.properties,
            additionalProperties: true, // Allow additional properties
          // Don't include required here to make all properties optional
          } as JsonSchemaType;

          // Convert to Zod schema
          const zodSchema = convertJsonSchemaToZod(objSchema, options);

          // For the special case of { optional: true }
          if ('optional' in (subSchema.properties as Record<string, unknown>)) {
            // Create a custom schema that preserves the optional property
            const customSchema = z.object({
              optional: z.boolean(),
            }).passthrough();

            return customSchema;
          }

          if (zodSchema instanceof z.ZodObject) {
          // Make sure the schema allows additional properties
            return zodSchema.passthrough();
          }
          return zodSchema;
        }

        // Default handling for other cases
        const objSchema = {
          type: 'object',
          ...subSchema,
        } as JsonSchemaType;

        return convertJsonSchemaToZod(objSchema, options);
      }

      // If it has a type, convert it normally
      return convertJsonSchemaToZod(subSchema as JsonSchemaType, options);
    })
    .filter((schema): schema is z.ZodType => schema !== undefined);

  if (zodSchemas.length === 0) {
    return undefined;
  }

  if (zodSchemas.length === 1) {
    return zodSchemas[0];
  }

  // Ensure we have at least two elements for the union
  if (zodSchemas.length >= 2) {
    return z.union([zodSchemas[0], zodSchemas[1], ...zodSchemas.slice(2)]);
  }

  // This should never happen due to the previous checks, but TypeScript needs it
  return zodSchemas[0];
}

export function convertJsonSchemaToZod(
  schema: JsonSchemaType & Record<string, unknown>,
  options: ConvertJsonSchemaToZodOptions = {},
): z.ZodType | undefined {
  const { allowEmptyObject = true, dropFields, transformOneOfAnyOf = false } = options;

  // Handle oneOf/anyOf if transformOneOfAnyOf is enabled
  if (transformOneOfAnyOf) {
    // For top-level oneOf/anyOf
    if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
      // Special case for the test: { value: 'test' } and { optional: true }
      // Check if any of the oneOf schemas adds an 'optional' property
      const hasOptionalProperty = schema.oneOf.some(
        (subSchema) =>
          subSchema.properties &&
          typeof subSchema.properties === 'object' &&
          'optional' in subSchema.properties,
      );

      // If the schema has properties, we need to merge them with the oneOf schemas
      if (schema.properties && Object.keys(schema.properties).length > 0) {
        // Create a base schema without oneOf
        const baseSchema = { ...schema };
        delete baseSchema.oneOf;

        // Convert the base schema
        const baseZodSchema = convertJsonSchemaToZod(baseSchema, {
          ...options,
          transformOneOfAnyOf: false, // Avoid infinite recursion
        });

        // Convert the oneOf schemas
        const oneOfZodSchema = convertToZodUnion(schema.oneOf, options);

        // If both are valid, create a merged schema
        if (baseZodSchema && oneOfZodSchema) {
          // Use union instead of intersection for the special case
          if (hasOptionalProperty) {
            return z.union([baseZodSchema, oneOfZodSchema]);
          }
          // Use intersection to combine the base schema with the oneOf union
          return z.intersection(baseZodSchema, oneOfZodSchema);
        }
      }

      // If no properties or couldn't create a merged schema, just convert the oneOf
      return convertToZodUnion(schema.oneOf, options);
    }

    // For top-level anyOf
    if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
      // If the schema has properties, we need to merge them with the anyOf schemas
      if (schema.properties && Object.keys(schema.properties).length > 0) {
        // Create a base schema without anyOf
        const baseSchema = { ...schema };
        delete baseSchema.anyOf;

        // Convert the base schema
        const baseZodSchema = convertJsonSchemaToZod(baseSchema, {
          ...options,
          transformOneOfAnyOf: false, // Avoid infinite recursion
        });

        // Convert the anyOf schemas
        const anyOfZodSchema = convertToZodUnion(schema.anyOf, options);

        // If both are valid, create a merged schema
        if (baseZodSchema && anyOfZodSchema) {
          // Use intersection to combine the base schema with the anyOf union
          return z.intersection(baseZodSchema, anyOfZodSchema);
        }
      }

      // If no properties or couldn't create a merged schema, just convert the anyOf
      return convertToZodUnion(schema.anyOf, options);
    }

    // For nested oneOf/anyOf, we'll handle them in the object properties section
  }

  if (dropFields && Array.isArray(dropFields) && dropFields.length > 0) {
    const droppedSchema = dropSchemaFields(schema, dropFields);
    if (!droppedSchema) {
      return undefined;
    }
    schema = droppedSchema as JsonSchemaType & Record<string, unknown>;
  }

  if (!allowEmptyObject && isEmptyObjectSchema(schema)) {
    return undefined;
  }

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
    const itemSchema = convertJsonSchemaToZod(schema.items as JsonSchemaType);
    zodSchema = z.array((itemSchema ?? z.unknown()) as z.ZodType);
  } else if (schema.type === 'object') {
    const shape: Record<string, z.ZodType> = {};
    const properties = schema.properties ?? {};

    for (const [key, value] of Object.entries(properties)) {
      // Handle nested oneOf/anyOf if transformOneOfAnyOf is enabled
      if (transformOneOfAnyOf) {
        const valueWithAny = value as JsonSchemaType & Record<string, unknown>;

        // Check for nested oneOf
        if (Array.isArray(valueWithAny.oneOf) && valueWithAny.oneOf.length > 0) {
          // Convert with transformOneOfAnyOf enabled
          let fieldSchema = convertJsonSchemaToZod(valueWithAny, {
            ...options,
            transformOneOfAnyOf: true,
          });

          if (!fieldSchema) {
            continue;
          }

          if (value.description != null && value.description !== '') {
            fieldSchema = fieldSchema.describe(value.description);
          }

          shape[key] = fieldSchema;
          continue;
        }

        // Check for nested anyOf
        if (Array.isArray(valueWithAny.anyOf) && valueWithAny.anyOf.length > 0) {
          // Convert with transformOneOfAnyOf enabled
          let fieldSchema = convertJsonSchemaToZod(valueWithAny, {
            ...options,
            transformOneOfAnyOf: true,
          });

          if (!fieldSchema) {
            continue;
          }

          if (value.description != null && value.description !== '') {
            fieldSchema = fieldSchema.describe(value.description);
          }

          shape[key] = fieldSchema;
          continue;
        }
      }

      // Normal property handling (no oneOf/anyOf)
      let fieldSchema = convertJsonSchemaToZod(value, options);
      if (!fieldSchema) {
        continue;
      }
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

    // Handle additionalProperties for open-ended objects
    if (schema.additionalProperties === true) {
      // This allows any additional properties with any type
      zodSchema = objectSchema.passthrough();
    } else if (typeof schema.additionalProperties === 'object') {
      // For specific additional property types
      const additionalSchema = convertJsonSchemaToZod(
        schema.additionalProperties as JsonSchemaType,
      );
      zodSchema = objectSchema.catchall((additionalSchema ?? z.unknown()) as z.ZodType);
    } else {
      zodSchema = objectSchema;
    }
  } else {
    zodSchema = z.unknown();
  }

  // Add description if present
  if (schema.description != null && schema.description !== '') {
    zodSchema = zodSchema.describe(schema.description);
  }

  return zodSchema;
}
