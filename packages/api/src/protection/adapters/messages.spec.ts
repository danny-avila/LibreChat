import type { FiltersConfig } from 'librechat-data-provider';
import { inspectContent } from '../runtime';
import { ContentTraversalLimitError, isNestedMessageTraversalProtected } from './nested';
import { extractMessageContent } from './messages';

describe('extractMessageContent', () => {
  it('treats every caller-supplied role as user provenance', () => {
    const fragments = Array.from(
      extractMessageContent([
        { role: 'system', content: 'system text' },
        { role: 'assistant', content: 'assistant text' },
        { role: 'tool', content: 'tool text' },
        { role: 'user', content: 'user text' },
      ]),
    );

    expect(
      fragments.map(({ text, provenance, source, field }) => ({
        text,
        provenance,
        source,
        field,
      })),
    ).toEqual([
      { text: 'system text', provenance: 'user', source: 'message', field: 'text' },
      {
        text: 'system text',
        provenance: 'user',
        source: 'agent_instruction',
        field: 'instructions',
      },
      { text: 'assistant text', provenance: 'user', source: 'message', field: 'text' },
      { text: 'tool text', provenance: 'user', source: 'message', field: 'text' },
      { text: 'tool text', provenance: 'user', source: 'tool_argument', field: 'output' },
      { text: 'user text', provenance: 'user', source: 'message', field: 'text' },
    ]);
  });

  it('lets instruction policy independently protect system and developer messages', () => {
    const filters: FiltersConfig = {
      agentInstructions: {
        pii: {
          fields: ['instructions'],
          starterPatterns: [],
          customPatterns: [
            {
              id: 'submitted-content',
              label: 'submitted content',
              regex: 'BLOCK-[A-Z]+',
            },
          ],
        },
      },
    };

    expect(
      inspectContent(
        extractMessageContent([
          { role: 'user', content: 'BLOCK-USER' },
          { role: 'system', content: 'BLOCK-SYSTEM' },
        ]),
        { filters },
      ),
    ).toMatchObject({
      source: 'agent_instruction',
      field: 'instructions',
      fragmentPath: '/1/content',
    });
    expect(
      inspectContent(
        extractMessageContent([
          {
            role: 'developer',
            content: [{ type: 'text', text: 'BLOCK-DEVELOPER' }],
          },
        ]),
        { filters },
      ),
    ).toMatchObject({
      source: 'agent_instruction',
      field: 'instructions',
      fragmentPath: '/0/content/0/text',
    });
  });

  it('extracts caller-supplied message names as message content', () => {
    expect(Array.from(extractMessageContent([{ role: 'user', name: 'submitted name' }]))).toEqual([
      {
        id: 'external-message.0.name',
        path: '/0/name',
        text: 'submitted name',
        source: 'message',
        field: 'name',
        format: 'plain',
        treatment: 'replaceable',
        provenance: 'user',
      },
    ]);
  });

  it('extracts every text-bearing content part without trusting its declared type', () => {
    const fragments = Array.from(
      extractMessageContent([
        {
          role: 'user',
          content: [
            { type: 'image_url' },
            { type: 'image_url', text: 'text on a non-text part' },
            { type: 'text', text: 'ordinary text part' },
            null,
          ],
        },
      ]),
    );

    expect(fragments).toEqual([
      {
        id: 'external-message.0.part.1',
        path: '/0/content/1/text',
        text: 'text on a non-text part',
        source: 'message',
        field: 'content_part',
        format: 'plain',
        treatment: 'replaceable',
        provenance: 'user',
      },
      {
        id: 'external-message.0.part.2',
        path: '/0/content/2/text',
        text: 'ordinary text part',
        source: 'message',
        field: 'content_part',
        format: 'plain',
        treatment: 'replaceable',
        provenance: 'user',
      },
      {
        id: 'external-message.0.assembled',
        path: '/0/content',
        text: 'text on a non-text partordinary text part',
        source: 'assembled_context',
        field: 'assembled_context',
        format: 'plain',
        treatment: 'inspect_only',
        provenance: 'user',
      },
    ]);
  });

  it('extracts file references and tool-call fields without inspecting data payloads', () => {
    const dataUri = `data:image/png;base64,${'a'.repeat(1024)}`;
    const fragments = Array.from(
      extractMessageContent([
        {
          content: [
            { type: 'image_url', image_url: { url: dataUri } },
            { type: 'image_url', image_url: 'https://example.test/image.png?token=ORG-REF' },
            { type: 'file', file_id: 'file-ORG-ID' },
            { type: 'file', filename: 'ORG-report.txt' },
            {
              type: 'file',
              file: { file_id: 'file-ORG-NESTED', filename: 'ORG-nested.txt' },
            },
          ],
          tool_calls: [{ function: { name: 'ORG-TOOL', arguments: '{"token":"ORG-ARGS"}' } }],
        },
      ]),
    );

    expect(
      fragments.map(({ text, source, field, format }) => ({ text, source, field, format })),
    ).toEqual([
      {
        text: 'https://example.test/image.png?token=ORG-REF',
        source: 'message',
        field: 'attachment_reference',
        format: 'uri',
      },
      {
        text: 'https://example.test/image.png?token=ORG-REF',
        source: 'file',
        field: 'uri',
        format: 'uri',
      },
      {
        text: 'file-ORG-ID',
        source: 'message',
        field: 'attachment_reference',
        format: 'plain',
      },
      {
        text: 'ORG-report.txt',
        source: 'message',
        field: 'attachment_reference',
        format: 'plain',
      },
      {
        text: 'ORG-report.txt',
        source: 'file',
        field: 'name',
        format: 'plain',
      },
      {
        text: 'file-ORG-NESTED',
        source: 'message',
        field: 'attachment_reference',
        format: 'plain',
      },
      {
        text: 'ORG-nested.txt',
        source: 'message',
        field: 'attachment_reference',
        format: 'plain',
      },
      {
        text: 'ORG-nested.txt',
        source: 'file',
        field: 'name',
        format: 'plain',
      },
      {
        text: 'ORG-TOOL',
        source: 'tool_argument',
        field: 'name',
        format: 'plain',
      },
      {
        text: '{"token":"ORG-ARGS"}',
        source: 'tool_argument',
        field: 'arguments',
        format: 'json',
      },
    ]);
    expect(fragments.some(({ text }) => text.includes(dataUri))).toBe(false);
  });

  it('extracts unknown nested textual leaves without rescanning structural or encoded payloads', () => {
    const cyclicPart: { type: string; payload: unknown; self?: unknown } = {
      type: 'vendor_content',
      payload: {
        'ORG-SECRET': false,
        source: {
          type: 'json',
          description: 'nested submitted description',
          data: 'ordinary submitted data',
        },
        encoded: {
          type: 'base64',
          data: 'encoded-payload-must-not-be-treated-as-text',
        },
        image: 'data:image/png;base64,opaque-image-data',
      },
    };
    cyclicPart.self = cyclicPart;

    const fragments = Array.from(extractMessageContent([{ role: 'user', content: [cyclicPart] }]));

    expect(fragments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'message',
          field: 'content_part',
          path: '/0/content/0/payload/ORG-SECRET',
          text: 'ORG-SECRET',
        }),
        expect.objectContaining({
          source: 'message',
          field: 'content_part',
          path: '/0/content/0/payload/source/description',
          text: 'nested submitted description',
        }),
        expect.objectContaining({
          source: 'message',
          field: 'content_part',
          path: '/0/content/0/payload/source/data',
          text: 'ordinary submitted data',
        }),
      ]),
    );
    expect(fragments.some(({ text }) => text.includes('encoded-payload'))).toBe(false);
    expect(fragments.some(({ text }) => text.includes('opaque-image-data'))).toBe(false);
    expect(fragments.some(({ text }) => text === 'vendor_content')).toBe(false);
  });

  it('fails closed instead of silently truncating an oversized nested part', () => {
    const content = [
      {
        type: 'vendor_content',
        payload: Array.from({ length: 5000 }, (_, index) => `submitted-${index}`),
      },
    ];

    expect(() => Array.from(extractMessageContent([{ role: 'user', content }]))).toThrow(
      ContentTraversalLimitError,
    );
  });

  it('fails closed when a nested value cannot be enumerated', () => {
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('blocked enumeration');
        },
      },
    );

    expect(() =>
      Array.from(
        extractMessageContent([
          {
            role: 'user',
            content: [{ type: 'vendor_content', payload: hostile }],
          },
        ]),
      ),
    ).toThrow(ContentTraversalLimitError);
  });

  it('applies traversal fail-close only to selected semantic fields', () => {
    expect(
      isNestedMessageTraversalProtected({
        filters: {
          messages: { pii: { fields: ['text'], starterPatterns: [] } },
        },
      }),
    ).toBe(false);
    expect(
      isNestedMessageTraversalProtected({
        filters: {
          messages: { pii: { fields: ['content_part'], starterPatterns: [] } },
        },
      }),
    ).toBe(false);
    expect(
      isNestedMessageTraversalProtected({
        filters: {
          messages: {
            pii: {
              fields: ['content_part'],
              starterPatterns: [],
              customPatterns: [{ id: 'active', label: 'active', regex: 'ACTIVE' }],
            },
          },
        },
      }),
    ).toBe(true);
    expect(
      isNestedMessageTraversalProtected({
        filters: {
          agentInstructions: { pii: { fields: ['instructions'] } },
        },
        roles: ['system'],
      }),
    ).toBe(true);
    expect(
      isNestedMessageTraversalProtected({
        filters: {
          toolArguments: { pii: { fields: ['output'], starterPatterns: ['email'] } },
        },
        roles: ['tool'],
      }),
    ).toBe(true);
  });

  it('inspects model-equivalent text assembled across adjacent content parts', () => {
    const filters: FiltersConfig = {
      messages: {
        pii: {
          fields: ['assembled_context'],
          starterPatterns: [],
          customPatterns: [{ id: 'split-token', label: 'split token', regex: 'sk-SECRET' }],
        },
      },
    };

    const finding = inspectContent(
      extractMessageContent([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'sk-' },
            { type: 'text', text: 'SECRET' },
          ],
        },
      ]),
      { filters },
    );

    expect(finding).toMatchObject({
      source: 'assembled_context',
      field: 'assembled_context',
      label: 'split token',
    });
  });
});
