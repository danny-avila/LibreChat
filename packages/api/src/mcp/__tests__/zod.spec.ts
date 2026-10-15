/* eslint-disable @typescript-eslint/no-explicit-any */
// zod.spec.ts
import { resolveJsonSchemaRefs, normalizeJsonSchema, sanitizeGeminiSchema } from '../zod';

describe('resolveJsonSchemaRefs $ref resolution', () => {
  it('should handle schemas with $ref references when resolved', () => {
    const schemaWithRefs = {
      type: 'object' as const,
      properties: {
        collection: {
          type: 'string' as const,
        },
        query: {
          type: 'object' as const,
          properties: {
            filter: {
              anyOf: [{ $ref: '#/$defs/__schema0' }, { type: 'null' as const }],
            },
          },
        },
      },
      required: ['collection', 'query'],
      $defs: {
        __schema0: {
          anyOf: [
            {
              type: 'object' as const,
              properties: {
                _or: {
                  type: 'array' as const,
                  items: { $ref: '#/$defs/__schema0' },
                },
              },
              required: ['_or'],
            },
            {
              type: 'object' as const,
              additionalProperties: {
                anyOf: [
                  {
                    type: 'object' as const,
                    properties: {
                      _eq: {
                        anyOf: [
                          { type: 'string' as const },
                          { type: 'number' as const },
                          { type: 'null' as const },
                        ],
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    };

    // Resolve refs first
    const resolvedSchema = resolveJsonSchemaRefs(schemaWithRefs);

    // Verify refs were resolved
    expect(resolvedSchema.properties?.query?.properties?.filter?.anyOf?.[0]).not.toHaveProperty(
      '$ref',
    );
    expect(resolvedSchema.properties?.query?.properties?.filter?.anyOf?.[0]).toHaveProperty(
      'anyOf',
    );
  });

  it('should handle circular $ref references without infinite loops', () => {
    const schemaWithCircularRefs = {
      type: 'object' as const,
      properties: {
        node: { $ref: '#/$defs/TreeNode' },
      },
      $defs: {
        TreeNode: {
          type: 'object' as const,
          properties: {
            value: { type: 'string' as const },
            children: {
              type: 'array' as const,
              items: { $ref: '#/$defs/TreeNode' },
            },
          },
        },
      },
    };

    // Should not throw or hang
    const resolved = resolveJsonSchemaRefs(schemaWithCircularRefs);
    expect(resolved).toBeDefined();
  });

  it('should strip $defs from the resolved output', () => {
    const schemaWithDefs = {
      type: 'object' as const,
      properties: {
        item: { $ref: '#/$defs/Item' },
      },
      $defs: {
        Item: {
          type: 'object' as const,
          properties: {
            name: { type: 'string' as const },
          },
        },
      },
    };

    const resolved = resolveJsonSchemaRefs(schemaWithDefs);
    // $defs should NOT be in the output, it was only used for resolution
    expect(resolved).not.toHaveProperty('$defs');
    // The $ref should be resolved inline
    expect(resolved.properties?.item).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
    });
  });

  it('should handle various edge cases safely', () => {
    // Test with null/undefined
    expect(resolveJsonSchemaRefs(null as any)).toBeNull();
    expect(resolveJsonSchemaRefs(undefined as any)).toBeUndefined();

    // Test with non-object primitives
    expect(resolveJsonSchemaRefs('string' as any)).toBe('string');
    expect(resolveJsonSchemaRefs(42 as any)).toBe(42);
    expect(resolveJsonSchemaRefs(true as any)).toBe(true);

    // Test with arrays
    const arrayInput = [{ type: 'string' }, { $ref: '#/def' }];
    const arrayResult = resolveJsonSchemaRefs(arrayInput as any);
    expect(Array.isArray(arrayResult)).toBe(true);
    expect(arrayResult).toHaveLength(2);

    // Test with schema that has no refs
    const noRefSchema = {
      type: 'object' as const,
      properties: {
        name: { type: 'string' as const },
        nested: {
          type: 'object' as const,
          properties: {
            value: { type: 'number' as const },
          },
        },
      },
    };

    const resolvedNoRef = resolveJsonSchemaRefs(noRefSchema);
    expect(resolvedNoRef).toEqual(noRefSchema);

    // Test with invalid ref (non-existent)
    const invalidRefSchema = {
      type: 'object' as const,
      properties: {
        item: { $ref: '#/$defs/nonExistent' },
      },
      $defs: {
        other: { type: 'string' as const },
      },
    };

    const resolvedInvalid = resolveJsonSchemaRefs(invalidRefSchema);
    // Invalid refs should be preserved as-is
    expect(resolvedInvalid.properties?.item?.$ref).toBe('#/$defs/nonExistent');

    // Test with empty object
    expect(resolveJsonSchemaRefs({})).toEqual({});

    // Test with schema containing special JSON Schema keywords
    const schemaWithKeywords = {
      type: 'object' as const,
      properties: {
        value: {
          type: 'string' as const,
          minLength: 5,
          maxLength: 10,
          pattern: '^[A-Z]',
        },
      },
      additionalProperties: false,
      minProperties: 1,
    };

    const resolvedKeywords = resolveJsonSchemaRefs(schemaWithKeywords);
    expect(resolvedKeywords).toEqual(schemaWithKeywords);
    expect(resolvedKeywords.properties?.value?.minLength).toBe(5);
    expect(resolvedKeywords.additionalProperties).toBe(false);
  });
});

describe('normalizeJsonSchema', () => {
  it('should convert const to enum', () => {
    const schema = { type: 'string', const: 'hello' } as any;
    const result = normalizeJsonSchema(schema);
    expect(result).toEqual({ type: 'string', enum: ['hello'] });
    expect(result).not.toHaveProperty('const');
  });

  it('should preserve existing enum when const is also present', () => {
    const schema = { type: 'string', const: 'hello', enum: ['hello', 'world'] } as any;
    const result = normalizeJsonSchema(schema);
    expect(result).toEqual({ type: 'string', enum: ['hello', 'world'] });
    expect(result).not.toHaveProperty('const');
  });

  it('should handle non-string const values (number, boolean, null)', () => {
    expect(normalizeJsonSchema({ type: 'number', const: 42 } as any)).toEqual({
      type: 'number',
      enum: [42],
    });
    expect(normalizeJsonSchema({ type: 'boolean', const: true } as any)).toEqual({
      type: 'boolean',
      enum: [true],
    });
    expect(normalizeJsonSchema({ type: 'string', const: null } as any)).toEqual({
      type: 'string',
      enum: [null],
    });
  });

  it('should recursively normalize nested object properties', () => {
    const schema = {
      type: 'object',
      properties: {
        mode: { type: 'string', const: 'advanced' },
        count: { type: 'number', const: 5 },
        name: { type: 'string', description: 'A name' },
      },
    } as any;

    const result = normalizeJsonSchema(schema);
    expect(result.properties.mode).toEqual({ type: 'string', enum: ['advanced'] });
    expect(result.properties.count).toEqual({ type: 'number', enum: [5] });
    expect(result.properties.name).toEqual({ type: 'string', description: 'A name' });
  });

  it('should normalize inside oneOf/anyOf/allOf arrays', () => {
    const schema = {
      type: 'object',
      oneOf: [
        { type: 'object', properties: { kind: { type: 'string', const: 'A' } } },
        { type: 'object', properties: { kind: { type: 'string', const: 'B' } } },
      ],
      anyOf: [{ type: 'string', const: 'x' }],
      allOf: [{ type: 'number', const: 1 }],
    } as any;

    const result = normalizeJsonSchema(schema);
    expect(result.oneOf[0].properties.kind).toEqual({ type: 'string', enum: ['A'] });
    expect(result.oneOf[1].properties.kind).toEqual({ type: 'string', enum: ['B'] });
    expect(result.anyOf[0]).toEqual({ type: 'string', enum: ['x'] });
    expect(result.allOf[0]).toEqual({ type: 'number', enum: [1] });
  });

  it('should normalize array items with const', () => {
    const schema = {
      type: 'array',
      items: { type: 'string', const: 'fixed' },
    } as any;

    const result = normalizeJsonSchema(schema);
    expect(result.items).toEqual({ type: 'string', enum: ['fixed'] });
  });

  it('should normalize additionalProperties with const', () => {
    const schema = {
      type: 'object',
      additionalProperties: { type: 'string', const: 'val' },
    } as any;

    const result = normalizeJsonSchema(schema);
    expect(result.additionalProperties).toEqual({ type: 'string', enum: ['val'] });
  });

  it('should drop malformed required keywords recursively', () => {
    const schema = {
      type: 'object',
      properties: {
        required: { type: 'boolean' },
        config: {
          type: 'object',
          properties: { host: { type: 'string' } },
          required: { host: true },
        },
      },
      oneOf: [{ type: 'object', required: 'name' }],
      items: { type: 'object', required: null },
      required: {},
    };

    expect(normalizeJsonSchema(schema)).toEqual({
      type: 'object',
      properties: {
        required: { type: 'boolean' },
        config: {
          type: 'object',
          properties: { host: { type: 'string' } },
        },
      },
      oneOf: [{ type: 'object' }],
      items: { type: 'object' },
    });
  });

  it('should normalize required arrays to unique property names', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
      },
      required: ['name', 42, null, 'age', 'name', { key: 'value' }],
    };

    expect(normalizeJsonSchema(schema).required).toEqual(['name', 'age']);
    expect(normalizeJsonSchema({ type: 'object', required: [] }).required).toEqual([]);
  });

  it('should handle null, undefined, and primitive inputs safely', () => {
    expect(normalizeJsonSchema(null as any)).toBeNull();
    expect(normalizeJsonSchema(undefined as any)).toBeUndefined();
    expect(normalizeJsonSchema('string' as any)).toBe('string');
    expect(normalizeJsonSchema(42 as any)).toBe(42);
    expect(normalizeJsonSchema(true as any)).toBe(true);
  });

  it('should be a no-op when no const is present', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name' },
        age: { type: 'number' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['name'],
    } as any;

    const result = normalizeJsonSchema(schema);
    expect(result).toEqual(schema);
  });

  it('should handle a Tavily-like schema pattern with const', () => {
    const schema = {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query',
        },
        search_depth: {
          type: 'string',
          const: 'advanced',
          description: 'The depth of the search',
        },
        topic: {
          type: 'string',
          enum: ['general', 'news'],
          description: 'The search topic',
        },
        include_answer: {
          type: 'boolean',
          const: true,
        },
        max_results: {
          type: 'number',
          const: 5,
        },
      },
      required: ['query'],
    } as any;

    const result = normalizeJsonSchema(schema);

    // const fields should be converted to enum
    expect(result.properties.search_depth).toEqual({
      type: 'string',
      enum: ['advanced'],
      description: 'The depth of the search',
    });
    expect(result.properties.include_answer).toEqual({
      type: 'boolean',
      enum: [true],
    });
    expect(result.properties.max_results).toEqual({
      type: 'number',
      enum: [5],
    });

    // Existing enum should be preserved
    expect(result.properties.topic).toEqual({
      type: 'string',
      enum: ['general', 'news'],
      description: 'The search topic',
    });

    // Non-const fields should be unchanged
    expect(result.properties.query).toEqual({
      type: 'string',
      description: 'The search query',
    });

    // Top-level fields preserved
    expect(result.required).toEqual(['query']);
    expect(result.type).toBe('object');
  });

  it('should handle arrays at the top level', () => {
    const schemas = [
      { type: 'string', const: 'a' },
      { type: 'number', const: 1 },
    ] as any;

    const result = normalizeJsonSchema(schemas);
    expect(result).toEqual([
      { type: 'string', enum: ['a'] },
      { type: 'number', enum: [1] },
    ]);
  });

  it('should strip vendor extension fields (x-* prefixed keys)', () => {
    const schema = {
      type: 'object',
      properties: {
        travelMode: {
          type: 'string',
          enum: ['DRIVE', 'BICYCLE', 'TRANSIT', 'WALK'],
          'x-google-enum-descriptions': ['By car', 'By bicycle', 'By public transit', 'By walking'],
          description: 'Mode of travel',
        },
      },
    } as any;

    const result = normalizeJsonSchema(schema);
    expect(result.properties.travelMode).toEqual({
      type: 'string',
      enum: ['DRIVE', 'BICYCLE', 'TRANSIT', 'WALK'],
      description: 'Mode of travel',
    });
    expect(result.properties.travelMode).not.toHaveProperty('x-google-enum-descriptions');
  });

  it('should strip x-* fields at all nesting levels', () => {
    const schema = {
      type: 'object',
      'x-custom-root': true,
      properties: {
        outer: {
          type: 'object',
          'x-custom-outer': 'value',
          properties: {
            inner: {
              type: 'string',
              'x-custom-inner': 42,
            },
          },
        },
        arr: {
          type: 'array',
          items: {
            type: 'string',
            'x-item-meta': 'something',
          },
        },
      },
    } as any;

    const result = normalizeJsonSchema(schema);
    expect(result).not.toHaveProperty('x-custom-root');
    expect(result.properties.outer).not.toHaveProperty('x-custom-outer');
    expect(result.properties.outer.properties.inner).not.toHaveProperty('x-custom-inner');
    expect(result.properties.arr.items).not.toHaveProperty('x-item-meta');
    // Standard fields should be preserved
    expect(result.type).toBe('object');
    expect(result.properties.outer.type).toBe('object');
    expect(result.properties.outer.properties.inner.type).toBe('string');
    expect(result.properties.arr.items.type).toBe('string');
  });

  it('should strip $defs and definitions as a safety net', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
      $defs: {
        SomeType: { type: 'string' },
      },
    } as any;

    const result = normalizeJsonSchema(schema);
    expect(result).not.toHaveProperty('$defs');
    expect(result.type).toBe('object');
    expect(result.properties.name).toEqual({ type: 'string' });
  });

  it('should strip the spec-compliant $schema keyword (MongoDB rejects $-prefixed keys)', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        title: { type: 'string' },
      },
      required: ['title'],
    } as any;

    const result = normalizeJsonSchema(schema);
    expect(result).not.toHaveProperty('$schema');
    expect(result.type).toBe('object');
    expect(result.properties.title).toEqual({ type: 'string' });
    expect(result.required).toEqual(['title']);
    // Nothing left behind that MongoDB would reject.
    expect(Object.keys(result).some((k) => k.startsWith('$'))).toBe(false);
  });

  it('should strip $-prefixed annotation keywords at all nesting levels', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'urn:tool:create_citation',
      $comment: 'root comment',
      type: 'object',
      properties: {
        note: {
          type: 'string',
          $comment: 'nested comment',
          $anchor: 'note',
        },
        items: {
          type: 'array',
          items: { type: 'string', $id: 'urn:item' },
        },
      },
    } as any;

    const result = normalizeJsonSchema(schema);
    expect(result).not.toHaveProperty('$schema');
    expect(result).not.toHaveProperty('$id');
    expect(result).not.toHaveProperty('$comment');
    expect(result.properties.note).toEqual({ type: 'string' });
    expect(result.properties.items.items).toEqual({ type: 'string' });
  });

  it('should preserve property names that begin with $', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        $ref: { type: 'string', description: 'a property literally named $ref' },
      },
    } as any;

    const result = normalizeJsonSchema(schema);
    expect(result).not.toHaveProperty('$schema');
    // A `$`-prefixed name under `properties` is a data field, not a keyword.
    expect(result.properties.$ref).toEqual({
      type: 'string',
      description: 'a property literally named $ref',
    });
  });

  it('should strip x-* fields inside oneOf/anyOf/allOf', () => {
    const schema = {
      type: 'object',
      oneOf: [
        { type: 'string', 'x-meta': 'a' },
        { type: 'number', 'x-meta': 'b' },
      ],
    } as any;

    const result = normalizeJsonSchema(schema);
    expect(result.oneOf[0]).toEqual({ type: 'string' });
    expect(result.oneOf[1]).toEqual({ type: 'number' });
  });

  it('should handle a Google Maps MCP-like schema with $defs and x-google-enum-descriptions', () => {
    const schema = {
      type: 'object',
      properties: {
        origin: { type: 'string', description: 'Starting address' },
        destination: { type: 'string', description: 'Ending address' },
        travelMode: {
          type: 'string',
          enum: ['DRIVE', 'BICYCLE', 'TRANSIT', 'WALK'],
          'x-google-enum-descriptions': ['By car', 'By bicycle', 'By public transit', 'By walking'],
        },
        waypoints: {
          type: 'array',
          items: { $ref: '#/$defs/Waypoint' },
        },
      },
      required: ['origin', 'destination'],
      $defs: {
        Waypoint: {
          type: 'object',
          properties: {
            location: { type: 'string' },
            stopover: { type: 'boolean' },
          },
        },
      },
    } as any;

    // First resolve refs, then normalize
    const resolved = resolveJsonSchemaRefs(schema);
    const result = normalizeJsonSchema(resolved);

    // $defs should be stripped (by both resolveJsonSchemaRefs and normalizeJsonSchema)
    expect(result).not.toHaveProperty('$defs');
    // x-google-enum-descriptions should be stripped
    expect(result.properties.travelMode).not.toHaveProperty('x-google-enum-descriptions');
    // $ref should be resolved inline
    expect(result.properties.waypoints.items).not.toHaveProperty('$ref');
    expect(result.properties.waypoints.items).toEqual({
      type: 'object',
      properties: {
        location: { type: 'string' },
        stopover: { type: 'boolean' },
      },
    });
    // Standard fields preserved
    expect(result.properties.travelMode.enum).toEqual(['DRIVE', 'BICYCLE', 'TRANSIT', 'WALK']);
    expect(result.properties.origin).toEqual({ type: 'string', description: 'Starting address' });
  });
});

describe('sanitizeGeminiSchema', () => {
  it('collapses a multi-member anyOf to its first member', () => {
    const schema = {
      anyOf: [
        { type: 'string', description: 'a string' },
        { type: 'number', description: 'a number' },
      ],
    } as any;

    const result = sanitizeGeminiSchema(schema);
    expect(result).toEqual({ type: 'string', description: 'a string' });
    expect(result).not.toHaveProperty('anyOf');
  });

  it('collapses oneOf the same way as anyOf', () => {
    const schema = {
      oneOf: [{ type: 'integer' }, { type: 'boolean' }],
    } as any;

    expect(sanitizeGeminiSchema(schema)).toEqual({ type: 'integer' });
  });

  it('preserves sibling keys and lets the chosen member override them', () => {
    const schema = {
      title: 'field',
      description: 'parent description',
      anyOf: [
        {
          type: 'object',
          description: 'member description',
          properties: { id: { type: 'string' } },
        },
        { type: 'string' },
      ],
    } as any;

    expect(sanitizeGeminiSchema(schema)).toEqual({
      title: 'field',
      description: 'member description',
      type: 'object',
      properties: { id: { type: 'string' } },
    });
  });

  it('marks the field nullable when a null member is dropped from a union', () => {
    const schema = {
      anyOf: [{ type: 'string' }, { type: 'null' }],
    } as any;

    expect(sanitizeGeminiSchema(schema)).toEqual({ type: 'string', nullable: true });
  });

  it('handles a 3-member union that includes null (google-common would throw on this)', () => {
    const schema = {
      anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'null' }],
    } as any;

    expect(sanitizeGeminiSchema(schema)).toEqual({ type: 'string', nullable: true });
  });

  it('collapses a nested union introduced by the chosen member', () => {
    const schema = {
      anyOf: [{ anyOf: [{ type: 'string' }, { type: 'number' }] }, { type: 'boolean' }],
    } as any;

    expect(sanitizeGeminiSchema(schema)).toEqual({ type: 'string' });
  });

  it('collapses multi-entry type arrays', () => {
    expect(sanitizeGeminiSchema({ type: ['string', 'number'] } as any)).toEqual({
      type: 'string',
    });
  });

  it('collapses a nullable type array to a single type plus nullable', () => {
    expect(sanitizeGeminiSchema({ type: ['string', 'null'] } as any)).toEqual({
      type: 'string',
      nullable: true,
    });
  });

  it('flattens unions nested inside object properties and array items', () => {
    const schema = {
      type: 'object',
      properties: {
        owner: { anyOf: [{ type: 'string' }, { type: 'object', properties: {} }] },
        labels: {
          type: 'array',
          items: { oneOf: [{ type: 'string' }, { type: 'object' }] },
        },
        plain: { type: 'string', description: 'untouched' },
      },
      required: ['owner'],
    } as any;

    const result = sanitizeGeminiSchema(schema);
    expect(result.properties.owner).toEqual({ type: 'string' });
    expect(result.properties.labels.items).toEqual({ type: 'string' });
    expect(result.properties.plain).toEqual({ type: 'string', description: 'untouched' });
    expect(result.required).toEqual(['owner']);
  });

  it('flattens a discriminated-union MCP tool schema (GitHub issue_write pattern)', () => {
    const schema = {
      type: 'object',
      properties: {
        method: {
          anyOf: [
            {
              type: 'object',
              properties: { action: { const: 'create' }, title: { type: 'string' } },
              required: ['action', 'title'],
            },
            {
              type: 'object',
              properties: { action: { const: 'update' }, issue_number: { type: 'number' } },
              required: ['action', 'issue_number'],
            },
          ],
        },
      },
    } as any;

    const result = sanitizeGeminiSchema(schema);
    expect(result.properties.method).toEqual({
      type: 'object',
      properties: { action: { type: 'string', enum: ['create'] }, title: { type: 'string' } },
      required: ['action', 'title'],
    });
    expect(result.properties.method).not.toHaveProperty('anyOf');
  });

  it('is a no-op for schemas without unions', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name' },
        age: { type: 'number' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['name'],
    } as any;

    expect(sanitizeGeminiSchema(schema)).toEqual(schema);
  });

  it('handles null, undefined, and primitive inputs safely', () => {
    expect(sanitizeGeminiSchema(null as any)).toBeNull();
    expect(sanitizeGeminiSchema(undefined as any)).toBeUndefined();
    expect(sanitizeGeminiSchema('string' as any)).toBe('string');
    expect(sanitizeGeminiSchema(42 as any)).toBe(42);
  });

  it('leaves no anyOf/oneOf/multi-type keys for google-common to reject', () => {
    const schema = {
      type: 'object',
      properties: {
        a: { anyOf: [{ type: 'string' }, { type: 'number' }] },
        b: { type: ['boolean', 'null'] },
        c: { oneOf: [{ type: 'object', properties: { x: { type: 'string' } } }, { type: 'null' }] },
      },
    } as any;

    const json = JSON.stringify(sanitizeGeminiSchema(schema));
    expect(json).not.toContain('"anyOf"');
    expect(json).not.toContain('"oneOf"');
    expect(sanitizeGeminiSchema(schema).properties.b).toEqual({
      type: 'boolean',
      nullable: true,
    });
  });

  it('preserves parent properties and required outside the union when collapsing', () => {
    const schema = {
      type: 'object',
      properties: { repo: { type: 'string' } },
      required: ['repo'],
      anyOf: [
        { properties: { title: { type: 'string' } }, required: ['title'] },
        { properties: { body: { type: 'string' } }, required: ['body'] },
      ],
    } as any;

    const result = sanitizeGeminiSchema(schema);
    expect(result.type).toBe('object');
    expect(result.properties).toEqual({
      repo: { type: 'string' },
      title: { type: 'string' },
    });
    expect([...result.required].sort()).toEqual(['repo', 'title']);
    expect(result).not.toHaveProperty('anyOf');
  });

  it('merges nested object properties from parent and chosen branch', () => {
    const schema = {
      type: 'object',
      properties: { owner: { type: 'string' } },
      oneOf: [
        { type: 'object', properties: { sha: { type: 'string' } } },
        { type: 'object', properties: { ref: { type: 'string' } } },
      ],
    } as any;

    expect(sanitizeGeminiSchema(schema).properties).toEqual({
      owner: { type: 'string' },
      sha: { type: 'string' },
    });
  });

  it('strips the dropped null from enum when a type array is nullable', () => {
    const schema = { type: ['string', 'null'], enum: ['open', 'closed', null] } as any;
    expect(sanitizeGeminiSchema(schema)).toEqual({
      type: 'string',
      nullable: true,
      enum: ['open', 'closed'],
    });
  });

  it('strips null from enum when nullability comes from a union member', () => {
    const schema = {
      anyOf: [{ type: 'string', enum: ['a', 'b', null] }, { type: 'null' }],
    } as any;

    const result = sanitizeGeminiSchema(schema);
    expect(result.type).toBe('string');
    expect(result.nullable).toBe(true);
    expect(result.enum).toEqual(['a', 'b']);
  });

  it('keeps enum untouched when the field is not nullable', () => {
    const schema = { type: ['string', 'number'], enum: ['a', 'b'] } as any;
    expect(sanitizeGeminiSchema(schema)).toEqual({ type: 'string', enum: ['a', 'b'] });
  });

  it('drops a boolean enum that Gemini rejects (the reported 400), keeping the type', () => {
    const schema = { type: 'boolean', enum: [true, false] } as any;
    expect(sanitizeGeminiSchema(schema)).toEqual({ type: 'boolean' });
  });

  it('drops a boolean enum produced by normalizeJsonSchema const→enum', () => {
    // normalizeJsonSchema turns `const: true` into `enum: [true]`; Gemini rejects it.
    const schema = normalizeJsonSchema({ type: 'boolean', const: true } as any);
    expect(sanitizeGeminiSchema(schema as any)).toEqual({ type: 'boolean' });
  });

  it('resolves the reported failing shape: boolean enum inside array→items→object', () => {
    // tools[0].function_declarations[N].parameters.properties[k].items.properties[0].enum[0] = true
    const schema = {
      type: 'object',
      properties: {
        rows: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              active: { type: 'boolean', enum: [true, false] },
              name: { type: 'string' },
            },
          },
        },
      },
    } as any;

    const result = sanitizeGeminiSchema(schema);
    expect(result.properties.rows.items.properties.active).toEqual({ type: 'boolean' });
    expect(JSON.stringify(result)).not.toContain('"enum"');
  });

  it('filters non-string members out of a mixed string enum', () => {
    const schema = { type: 'string', enum: ['a', 1, true, 'b', null] } as any;
    expect(sanitizeGeminiSchema(schema)).toEqual({ type: 'string', enum: ['a', 'b'] });
  });

  it('strips unsupported keywords (additionalProperties, $schema) but keeps Gemini-supported default', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      additionalProperties: { type: 'string' },
      properties: {
        name: { type: 'string', default: 'anon' },
      },
    } as any;

    const result = sanitizeGeminiSchema(schema);
    expect(result).not.toHaveProperty('$schema');
    expect(result).not.toHaveProperty('additionalProperties');
    expect(result.properties.name).toEqual({ type: 'string', default: 'anon' });
  });

  it('folds exclusive bounds into inclusive minimum/maximum', () => {
    const schema = { type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 100 } as any;
    expect(sanitizeGeminiSchema(schema)).toEqual({ type: 'number', minimum: 0, maximum: 100 });
  });

  it('does not overwrite an existing minimum with an exclusive bound', () => {
    const schema = { type: 'number', minimum: 5, exclusiveMinimum: 0 } as any;
    expect(sanitizeGeminiSchema(schema)).toEqual({ type: 'number', minimum: 5 });
  });

  it('merges allOf intersections into a single object', () => {
    const schema = {
      allOf: [
        { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] },
        { type: 'object', properties: { b: { type: 'number' } }, required: ['b'] },
      ],
    } as any;

    const result = sanitizeGeminiSchema(schema);
    expect(result.type).toBe('object');
    expect(result.properties).toEqual({ a: { type: 'string' }, b: { type: 'number' } });
    expect([...result.required].sort()).toEqual(['a', 'b']);
    expect(result).not.toHaveProperty('allOf');
  });

  it('leaves a clean Gemini-ready schema unchanged', () => {
    const schema = {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repo owner' },
        side: { type: 'string', enum: ['LEFT', 'RIGHT'] },
        line: { type: 'number' },
      },
      required: ['owner'],
    } as any;

    expect(sanitizeGeminiSchema(schema)).toEqual(schema);
  });

  it('drops the enum when a mixed type array collapses to a non-string type', () => {
    const schema = { type: ['integer', 'string'], enum: [1, 'auto'] } as any;
    expect(sanitizeGeminiSchema(schema)).toEqual({ type: 'integer' });
  });

  it('keeps the enum when a mixed type array collapses to string', () => {
    const schema = { type: ['string', 'integer'], enum: ['auto', 1] } as any;
    expect(sanitizeGeminiSchema(schema)).toEqual({ type: 'string', enum: ['auto'] });
  });

  it('makes a typeless surviving enum a string type (Gemini enum requires Type.STRING)', () => {
    const schema = { enum: ['a', 'b'] } as any;
    expect(sanitizeGeminiSchema(schema)).toEqual({ type: 'string', enum: ['a', 'b'] });
  });

  it('drops a number enum on an integer field', () => {
    const schema = { type: 'integer', enum: [1, 2, 3] } as any;
    expect(sanitizeGeminiSchema(schema)).toEqual({ type: 'integer' });
  });

  it('strips annotation keywords Gemini rejects (examples, readOnly, writeOnly, deprecated, $comment)', () => {
    const schema = {
      type: 'object',
      properties: {
        token: {
          type: 'string',
          examples: ['abc'],
          readOnly: true,
          writeOnly: false,
          deprecated: true,
          $comment: 'internal',
        },
      },
    } as any;
    expect(sanitizeGeminiSchema(schema)).toEqual({
      type: 'object',
      properties: { token: { type: 'string' } },
    });
  });

  it('strips numeric/array validators Gemini rejects (multipleOf, uniqueItems)', () => {
    const schema = {
      type: 'object',
      properties: {
        count: { type: 'integer', multipleOf: 2 },
        tags: { type: 'array', items: { type: 'string' }, uniqueItems: true },
      },
    } as any;
    expect(sanitizeGeminiSchema(schema)).toEqual({
      type: 'object',
      properties: {
        count: { type: 'integer' },
        tags: { type: 'array', items: { type: 'string' } },
      },
    });
  });

  it('strips object-composition keywords Gemini rejects (patternProperties, propertyNames, dependentRequired)', () => {
    const schema = {
      type: 'object',
      properties: { a: { type: 'string' } },
      patternProperties: { '^x': { type: 'string' } },
      propertyNames: { pattern: '^[a-z]+$' },
      dependentRequired: { a: ['b'] },
    } as any;
    expect(sanitizeGeminiSchema(schema)).toEqual({
      type: 'object',
      properties: { a: { type: 'string' } },
    });
  });

  it('strips tuple/array-extension keywords Gemini rejects (prefixItems, additionalItems)', () => {
    const schema = {
      type: 'array',
      items: { type: 'string' },
      prefixItems: [{ type: 'string' }, { type: 'number' }],
      additionalItems: false,
    } as any;
    expect(sanitizeGeminiSchema(schema)).toEqual({
      type: 'array',
      items: { type: 'string' },
    });
  });

  it('synthesizes `items` from `prefixItems` when a tuple array has none (Gemini requires items)', () => {
    const schema = {
      type: 'array',
      prefixItems: [{ type: 'string', readOnly: true }, { type: 'number' }],
    } as any;
    expect(sanitizeGeminiSchema(schema)).toEqual({
      type: 'array',
      items: { type: 'string' },
    });
  });

  it('preserves an existing `items` over a `prefixItems`-derived one', () => {
    const schema = {
      type: 'array',
      items: { type: 'boolean' },
      prefixItems: [{ type: 'string' }],
    } as any;
    expect(sanitizeGeminiSchema(schema)).toEqual({
      type: 'array',
      items: { type: 'boolean' },
    });
  });

  it('synthesizes `items` from `prefixItems` when `items` is boolean false (Draft 2020 tuple)', () => {
    const schema = {
      type: 'array',
      prefixItems: [{ type: 'number' }],
      items: false,
    } as any;
    expect(sanitizeGeminiSchema(schema)).toEqual({
      type: 'array',
      items: { type: 'number' },
    });
  });

  it('falls back to an empty `items` schema for a boolean `items` with no prefixItems', () => {
    expect(sanitizeGeminiSchema({ type: 'array', items: false } as any)).toEqual({
      type: 'array',
      items: {},
    });
    expect(sanitizeGeminiSchema({ type: 'array', items: true } as any)).toEqual({
      type: 'array',
      items: {},
    });
  });

  it('falls back to an empty `items` schema for an array missing items entirely', () => {
    expect(sanitizeGeminiSchema({ type: 'array' } as any)).toEqual({
      type: 'array',
      items: {},
    });
  });

  it('drops a tuple-array `items: [...]` form and falls back rather than emit an array items', () => {
    const schema = { type: 'array', items: [{ type: 'string' }, { type: 'number' }] } as any;
    expect(sanitizeGeminiSchema(schema)).toEqual({ type: 'array', items: {} });
  });

  it('preserves an object `default` verbatim without sanitizing its data keys', () => {
    const schema = {
      type: 'object',
      properties: {
        cfg: {
          type: 'object',
          default: { id: 'abc', readOnly: true, deprecated: false, nested: { id: 'x' } },
          properties: { id: { type: 'string' } },
        },
      },
    } as any;
    const result = sanitizeGeminiSchema(schema);
    expect(result.properties.cfg.default).toEqual({
      id: 'abc',
      readOnly: true,
      deprecated: false,
      nested: { id: 'x' },
    });
    expect(result.properties.cfg.properties).toEqual({ id: { type: 'string' } });
  });

  it('preserves an array `default` verbatim', () => {
    const schema = {
      type: 'array',
      items: { type: 'string' },
      default: ['id', 'readOnly'],
    } as any;
    expect(sanitizeGeminiSchema(schema)).toEqual({
      type: 'array',
      items: { type: 'string' },
      default: ['id', 'readOnly'],
    });
  });

  it('strips content keywords and the bare `id` alias Gemini rejects', () => {
    const schema = {
      id: 'urn:example',
      type: 'object',
      properties: {
        blob: { type: 'string', contentEncoding: 'base64', contentMediaType: 'image/png' },
      },
    } as any;
    expect(sanitizeGeminiSchema(schema)).toEqual({
      type: 'object',
      properties: { blob: { type: 'string' } },
    });
  });

  it('strips deeply nested unsupported keywords through arrays, items, and properties', () => {
    const schema = {
      type: 'object',
      properties: {
        ranges: {
          type: 'array',
          items: {
            type: 'object',
            properties: { score: { type: 'number', exclusiveMinimum: 0, multipleOf: 0.5 } },
          },
        },
      },
    } as any;
    expect(sanitizeGeminiSchema(schema)).toEqual({
      type: 'object',
      properties: {
        ranges: {
          type: 'array',
          items: {
            type: 'object',
            properties: { score: { type: 'number', minimum: 0 } },
          },
        },
      },
    });
  });

  it('strips unresolvable `$ref` keys that survive ref resolution (Gemini rejects them)', () => {
    const schema = {
      type: 'object',
      properties: {
        recurrence: { $ref: 'https://example.com/external.json', description: 'Recurrence rule' },
      },
    } as any;
    expect(sanitizeGeminiSchema(schema)).toEqual({
      type: 'object',
      properties: {
        recurrence: { description: 'Recurrence rule' },
      },
    });
  });
});

describe('resolveJsonSchemaRefs local pointer refs', () => {
  it('resolves a `#/properties/...` pointer against the root schema', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        body: {
          type: 'object' as const,
          properties: {
            start: {
              type: 'object' as const,
              properties: {
                dateTime: { type: 'string' as const },
                timeZone: { type: 'string' as const },
              },
            },
            end: { $ref: '#/properties/body/properties/start' },
          },
        },
      },
    };

    const resolved = resolveJsonSchemaRefs(schema);
    expect(resolved.properties?.body?.properties?.end).toEqual({
      type: 'object',
      properties: {
        dateTime: { type: 'string' },
        timeZone: { type: 'string' },
      },
    });
    expect(JSON.stringify(resolved)).not.toContain('$ref');
  });

  it('resolves pointers that traverse array indices (e.g. anyOf members)', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        daysOfWeek: {
          type: 'array' as const,
          items: {
            anyOf: [{ type: 'string' as const, enum: ['monday', 'tuesday'] }],
          },
        },
        firstDayOfWeek: { $ref: '#/properties/daysOfWeek/items/anyOf/0' },
      },
    };

    const resolved = resolveJsonSchemaRefs(schema);
    expect(resolved.properties?.firstDayOfWeek).toEqual({
      type: 'string',
      enum: ['monday', 'tuesday'],
    });
  });

  it('breaks mutually circular local pointers without hanging', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        a: { $ref: '#/properties/b' },
        b: { $ref: '#/properties/a' },
      },
    };

    const resolved = resolveJsonSchemaRefs(schema);
    expect(resolved.properties?.a).toEqual({ type: 'object' });
    expect(resolved.properties?.b).toEqual({ type: 'object' });
  });

  it('keeps dangling local pointers as-is', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        broken: { $ref: '#/properties/missing/nested' },
      },
    };

    const resolved = resolveJsonSchemaRefs(schema);
    expect(resolved.properties?.broken).toEqual({ $ref: '#/properties/missing/nested' });
  });

  it('unescapes RFC 6901 tokens (~0 → ~, ~1 → /) in pointer segments', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        'a/b': { type: 'string' as const },
        alias: { $ref: '#/properties/a~1b' },
      },
    };

    const resolved = resolveJsonSchemaRefs(schema);
    expect(resolved.properties?.alias).toEqual({ type: 'string' });
  });
});

describe('normalizeJsonSchema $-key recursion', () => {
  /** Mongo rejects `$`-prefixed field names at any depth, so a `$` keyword nested
   *  under a schema-valued container has to be stripped too or the stored
   *  `parameters` blob still fails to persist. */
  const nested = (container: Record<string, unknown>) =>
    normalizeJsonSchema({
      type: 'object',
      properties: { q: { type: 'string', ...container } },
    } as Record<string, unknown>) as {
      properties: { q: Record<string, unknown> };
    };

  it.each([
    ['not', { not: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'null' } }],
    ['if', { if: { $comment: 'x', type: 'string' } }],
    ['then', { then: { $comment: 'x', type: 'string' } }],
    ['else', { else: { $comment: 'x', type: 'string' } }],
    ['contains', { contains: { $id: 'x', type: 'string' } }],
    ['propertyNames', { propertyNames: { $comment: 'x', type: 'string' } }],
  ])('strips a $ keyword nested under %s', (name, container) => {
    const result = nested(container);
    expect(JSON.stringify(result)).not.toContain('"$');
    expect(result.properties.q[name]).toBeDefined();
  });

  it('strips $ keywords under patternProperties and dependentSchemas', () => {
    const result = normalizeJsonSchema({
      type: 'object',
      patternProperties: { '^a': { $schema: 'x', type: 'string' } },
      dependentSchemas: { a: { $comment: 'x', type: 'object' } },
    } as Record<string, unknown>);

    expect(JSON.stringify(result)).not.toContain('"$');
  });

  it('strips $ keywords under prefixItems', () => {
    const result = normalizeJsonSchema({
      type: 'array',
      prefixItems: [{ $schema: 'x', type: 'string' }],
    } as Record<string, unknown>);

    expect(JSON.stringify(result)).not.toContain('"$');
  });

  it('preserves a $-prefixed property name, which is data rather than a keyword', () => {
    /** `$filter` is a real argument the tool accepts; dropping it would silently
     *  remove the parameter from the schema the model sees. Modern MongoDB accepts
     *  `$`-prefixed field names, so this is left intact deliberately. */
    const result = normalizeJsonSchema({
      type: 'object',
      properties: { $filter: { type: 'string', $comment: 'odata' } },
    } as Record<string, unknown>) as { properties: Record<string, unknown> };

    expect(result.properties.$filter).toEqual({ type: 'string' });
  });
});

describe('normalizeJsonSchema draft-07 and 2020-12 containers', () => {
  it('strips a $ keyword under draft-07 dependencies', () => {
    const result = normalizeJsonSchema({
      type: 'object',
      dependencies: { foo: { $comment: 'x', type: 'object' } },
    } as Record<string, unknown>);

    expect(JSON.stringify(result)).not.toContain('"$');
  });

  it('leaves a draft-07 dependencies property-name array intact', () => {
    /** `dependencies` is polymorphic: an array of required property names is data,
     *  not a subschema, and must round-trip unchanged. */
    const result = normalizeJsonSchema({
      type: 'object',
      dependencies: { foo: ['bar', 'baz'] },
    } as Record<string, unknown>) as { dependencies: Record<string, unknown> };

    expect(result.dependencies.foo).toEqual(['bar', 'baz']);
  });

  it('strips a $ keyword under contentSchema', () => {
    const result = normalizeJsonSchema({
      type: 'string',
      contentMediaType: 'application/json',
      contentSchema: { $schema: 'x', type: 'object' },
    } as Record<string, unknown>);

    expect(JSON.stringify(result)).not.toContain('"$');
  });
});

describe('normalizeJsonSchema prototype-polluting map keys', () => {
  /** An MCP server's schema arrives as JSON, and `JSON.parse` creates a real own
   *  `__proto__` property — unlike an object literal, where it sets the prototype. */
  const parse = (json: string) => JSON.parse(json) as Record<string, unknown>;

  it('keeps a __proto__ entry in a schema map as an own property', () => {
    const result = normalizeJsonSchema(
      parse('{"type":"object","properties":{"__proto__":{"type":"string","$comment":"x"}}}'),
    ) as { properties: Record<string, unknown> };

    expect(Object.prototype.hasOwnProperty.call(result.properties, '__proto__')).toBe(true);
    expect(JSON.parse(JSON.stringify(result)).properties.__proto__).toEqual({ type: 'string' });
  });

  it('keeps a __proto__ entry under dependentSchemas', () => {
    const result = normalizeJsonSchema(
      parse('{"type":"object","dependentSchemas":{"__proto__":{"type":"object"}}}'),
    ) as { dependentSchemas: Record<string, unknown> };

    expect(Object.prototype.hasOwnProperty.call(result.dependentSchemas, '__proto__')).toBe(true);
  });
});

describe('resolveJsonSchemaRefs expansion safety', () => {
  /** A remote MCP server controls this schema. Each `Dn` holding two refs to
   *  `Dn-1` is a compact acyclic graph that expands 2^n, so registration must
   *  stay bounded rather than exhaust memory. */
  const fanOutSchema = (depth: number) => {
    const $defs: Record<string, unknown> = { D0: { type: 'string' } };
    for (let i = 1; i <= depth; i++) {
      $defs[`D${i}`] = {
        type: 'object',
        properties: { a: { $ref: `#/$defs/D${i - 1}` }, b: { $ref: `#/$defs/D${i - 1}` } },
      };
    }
    return { $defs, $ref: `#/$defs/D${depth}` } as Record<string, unknown>;
  };

  it('stays bounded on an exponentially-expanding reference graph', () => {
    const start = Date.now();
    const result = resolveJsonSchemaRefs(fanOutSchema(30));
    const nodes = JSON.stringify(result).length;

    expect(Date.now() - start).toBeLessThan(10_000);
    expect(nodes).toBeLessThan(50_000_000);
  });

  it('still resolves an ordinary reference graph fully', () => {
    const result = resolveJsonSchemaRefs({
      $defs: { Name: { type: 'string' } },
      type: 'object',
      properties: { first: { $ref: '#/$defs/Name' } },
    } as Record<string, unknown>) as { properties: { first: Record<string, unknown> } };

    expect(result.properties.first).toEqual({ type: 'string' });
  });

  it('keeps a __proto__ argument through reference resolution', () => {
    const parsed = JSON.parse(
      '{"type":"object","properties":{"__proto__":{"type":"string"}}}',
    ) as Record<string, unknown>;
    const result = resolveJsonSchemaRefs(parsed) as { properties: Record<string, unknown> };

    expect(Object.prototype.hasOwnProperty.call(result.properties, '__proto__')).toBe(true);
  });
});
