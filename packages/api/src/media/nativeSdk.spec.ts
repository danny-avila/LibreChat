import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { CustomChatGoogleGenerativeAI } from '@librechat/agents/llm/google';
import { Run, StandardGraph, Providers, createHandlers } from '@librechat/agents';
import type { NativeMediaPart, NativeMediaPort, NativeMediaContent } from '@librechat/agents';
import type { GenerateContentRequest, Part } from '@google/generative-ai';
import { collapseAssistantReplayContent } from './replay';
import { createDeferredNativeMediaPort } from './sdk';

const imageData = 'aW1tdXRhYmxlLWltYWdlLWJ5dGVz';
const imagePart = {
  inlineData: { mimeType: 'image/png', data: imageData },
  thoughtSignature: 'private-signature',
};
type FixturePart = Part & { thoughtSignature?: string };
function response(parts: FixturePart[]) {
  return {
    candidates: [{ index: 0, content: { role: 'model', parts } }],
    text: () => '',
    functionCalls: () => undefined,
  };
}
function fixturePort(overrides: Partial<NativeMediaPort> = {}) {
  const parts = new Map<string, NativeMediaPart>();
  const port: NativeMediaPort = {
    start: jest.fn(async () => ({ responseModalities: ['TEXT', 'IMAGE'] })),
    part: jest.fn(async ({ part, chunkIndex, partIndex }): Promise<NativeMediaContent> => {
      const continuationRef = `ref-${chunkIndex}-${partIndex}`;
      parts.set(continuationRef, part);
      if (part.kind === 'text')
        return { type: 'text', text: part.text, native_media: { continuationRef } };
      return {
        type: 'image_file',
        image_file: {
          file_id: continuationRef,
          filepath: `/images/owner/${continuationRef}.png`,
          filename: `${continuationRef}.png`,
          type: part.mimeType,
          bytes: 21,
        },
        native_media: { continuationRef },
      };
    }),
    complete: jest.fn(async () => undefined),
    fail: jest.fn(async () => undefined),
    restore: jest.fn(async ({ continuationRef }) => {
      const part = parts.get(continuationRef ?? '');
      if (!part) throw new Error('Missing continuation');
      return part;
    }),
    ...overrides,
  };
  return port;
}
function fixtureModel(
  nativeMedia?: NativeMediaPort,
  chunks: FixturePart[][] = [[{ text: 'Before' }, imagePart], [{ text: 'After' }]],
) {
  const model = new CustomChatGoogleGenerativeAI({
    model: 'gemini-3-pro-image-preview',
    apiKey: 'fixture',
    nativeMedia,
    _lc_stream_delay: 0,
    maxRetries: 0,
  });
  const client = Reflect.get(model, 'client') as {
    generationConfig: { responseModalities?: string[] };
    generateContentStream: (
      request: GenerateContentRequest,
    ) => Promise<{ stream: AsyncGenerator<ReturnType<typeof response>> }>;
    generateContent: (
      request: GenerateContentRequest,
    ) => Promise<{ response: ReturnType<typeof response> }>;
  };
  client.generateContentStream = jest.fn(async () => ({
    stream: (async function* () {
      for (const parts of chunks) yield response(parts);
    })(),
  }));
  client.generateContent = jest.fn(async () => ({ response: response(chunks.flat()) }));
  return { model, client };
}

async function graphRun(model: CustomChatGoogleGenerativeAI) {
  const handlers = createHandlers();
  const run = await Run.create({
    runId: 'fixture-run',
    returnContent: true,
    graphConfig: {
      agents: [
        {
          agentId: 'fixture-agent',
          provider: Providers.GOOGLE,
          clientOptions: { model: model.model, apiKey: 'fixture' },
          tools: [],
        },
      ],
      signal: new AbortController().signal,
    },
    customHandlers: handlers.handlers,
  });
  if (!(run.Graph instanceof StandardGraph)) throw new Error('Expected standard graph');
  run.Graph.overrideModel = model;
  const content = await run.processStream(
    { messages: [new HumanMessage('Draw two examples')] },
    { configurable: { thread_id: 'fixture-thread' }, version: 'v2' },
  );
  if (!content) throw new Error('Expected rendered content');
  return { content: handlers.contentParts, messages: run.getRunMessages(), durable: content };
}

describe('tracked native Google SDK protocol', () => {
  it('keeps unconfigured plain text behavior without exposing private text signatures', async () => {
    const { model } = fixtureModel(undefined, [
      [{ text: 'Hello', thoughtSignature: 'private-text-signature' }],
    ]);
    const result = await model._generate([new HumanMessage('Hello')], {});
    expect(result.generations[0].text).toBe('Hello');
    expect(JSON.stringify(result)).not.toContain('private-text-signature');
  });
  it('stores each original before ordered mixed parts enter actual SDK aggregation or serialization', async () => {
    const port = fixturePort();
    const { model, client } = fixtureModel(port, [
      [{ text: 'Before', thoughtSignature: 'signed-text' }, imagePart],
      [{ text: 'Between' }, imagePart],
      [{ text: 'After' }],
    ]);
    const { content, messages, durable } = await graphRun(model);
    expect(content.map((part) => part?.type)).toEqual([
      'text',
      'image_file',
      'text',
      'image_file',
      'text',
    ]);
    expect(
      content
        .filter((part) => part?.type === 'text')
        .map((part) => (part && 'text' in part ? part.text : undefined)),
    ).toEqual(['Before', 'Between', 'After']);
    expect(durable.map((part) => part.type)).toEqual([
      'text',
      'image_file',
      'text',
      'image_file',
      'text',
    ]);
    expect(port.part).toHaveBeenCalledTimes(5);
    expect(port.part).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        chunkIndex: 0,
        partIndex: 1,
        part: {
          kind: 'image',
          mimeType: 'image/png',
          data: imageData,
          thoughtSignature: 'private-signature',
        },
      }),
    );
    expect(port.complete).toHaveBeenCalledTimes(1);
    expect(port.fail).not.toHaveBeenCalled();
    expect(client.generationConfig.responseModalities).toEqual(['TEXT', 'IMAGE']);
    expect(JSON.stringify({ content, messages })).not.toContain(imageData);
    expect(JSON.stringify({ content, messages })).not.toContain('private-signature');
    expect(JSON.stringify(messages?.map((message) => message.toJSON()))).not.toContain(imageData);
  });

  it('restores exact signed model parts on the next provider request without mutating stored references', async () => {
    const port = fixturePort();
    const { model, client } = fixtureModel(port);
    const first = await model._generate([new HumanMessage('Draw')], {});
    const previous = first.generations[0].message;
    const saved = JSON.stringify(previous);
    await model._generate([new HumanMessage('Draw'), previous, new HumanMessage('Refine')], {});
    expect(client.generateContent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contents: [
          expect.any(Object),
          { role: 'model', parts: [{ text: 'Before' }, imagePart, { text: 'After' }] },
          expect.any(Object),
        ],
      }),
    );
    expect(JSON.stringify(previous)).toBe(saved);
    expect(saved).not.toContain(imageData);
    expect(JSON.stringify(previous.toJSON())).not.toContain(imageData);
    expect(port.restore).toHaveBeenCalledTimes(3);
  });

  it('fails closed before emitting inline bytes when storage fails or no sink is configured', async () => {
    const port = fixturePort({
      part: jest.fn(async (): Promise<NativeMediaContent> => {
        throw new Error('disk unavailable');
      }),
    });
    const { model } = fixtureModel(port, [[imagePart]]);
    await expect(model._generate([new HumanMessage('Draw')], {})).rejects.toThrow(
      'disk unavailable',
    );
    expect(port.fail).toHaveBeenCalledWith(expect.objectContaining({ reason: 'storage' }));
    expect(port.complete).not.toHaveBeenCalled();
    const absent = fixtureModel(undefined, [[imagePart]]);
    const emit = jest.fn();
    await expect(
      (async () => {
        for await (const chunk of absent.model._streamResponseChunks(
          [new HumanMessage('Draw')],
          {},
        ))
          emit(chunk);
      })(),
    ).rejects.toThrow('configured storage');
    expect(emit).not.toHaveBeenCalled();
  });

  it('records cancellation and never emits a persisted part after abort', async () => {
    const controller = new AbortController();
    const port = fixturePort({
      part: jest.fn(async (): Promise<NativeMediaContent> => {
        controller.abort();
        return { type: 'text', text: 'late' };
      }),
    });
    const { model, client } = fixtureModel(port, [[{ text: 'late' }]]);
    const emit = jest.fn();
    await expect(
      (async () => {
        for await (const chunk of model._streamResponseChunks([new HumanMessage('Draw')], {
          signal: controller.signal,
        }))
          emit(chunk);
      })(),
    ).rejects.toThrow();
    expect(emit).not.toHaveBeenCalled();
    expect(port.fail).toHaveBeenCalledWith(expect.objectContaining({ reason: 'aborted' }));
    expect(client.generateContentStream).toHaveBeenCalledTimes(1);
  });

  it('resolves deferred admission once before a paid call and preserves an explicit text-only invocation', async () => {
    const port = fixturePort({ start: jest.fn(async () => undefined) });
    const factory = jest.fn(async () => port);
    const selection = {
      provider: 'google',
      model: 'gemini-3-pro-image-preview',
      responseModalities: ['TEXT'],
    };
    const { model, client } = fixtureModel(createDeferredNativeMediaPort(factory, selection), [
      [{ text: 'text only' }],
    ]);
    expect(factory).not.toHaveBeenCalled();
    await model._generate([new HumanMessage('Hello')], {});
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith(selection);
    expect(client.generationConfig.responseModalities).toBeUndefined();
    const rejected = fixtureModel(
      createDeferredNativeMediaPort(async () => {
        throw new Error('not permitted');
      }, selection),
    );
    await expect(rejected.model._generate([new HumanMessage('Draw')], {})).rejects.toThrow(
      'not permitted',
    );
    expect(rejected.client.generateContent).not.toHaveBeenCalled();
  });

  it('does not force legacy tool images into native continuation lookup and fails closed for unavailable native references', async () => {
    const port = fixturePort();
    const { model } = fixtureModel(port, [[{ text: 'ok' }]]);
    await expect(
      model._generate(
        [
          new AIMessage({ content: [{ type: 'image_file', image_file: { file_id: 'legacy' } }] }),
          new HumanMessage('Continue'),
        ],
        {},
      ),
    ).rejects.toThrow('Unknown content type image_file');
    expect(port.restore).not.toHaveBeenCalled();
    const absent = fixtureModel(undefined);
    await expect(
      absent.model._generate(
        [
          new AIMessage({
            content: [{ type: 'text', text: 'saved', native_media: { continuationRef: 'ref' } }],
          }),
          new HumanMessage('Continue'),
        ],
        {},
      ),
    ).rejects.toThrow('configured storage');
    expect(absent.client.generateContent).not.toHaveBeenCalled();
  });

  it('preserves media and opaque signed text through host reasoning, tool and steering flushes', () => {
    const parts = [
      { type: 'text' as const, text: 'before', native_media: { continuationRef: 'opaque' } },
      { type: 'image_file' as const, image_file: { file_id: 'immutable' } },
      { type: 'text' as const, text: 'after' },
    ];
    expect(collapseAssistantReplayContent(parts)).toBe(parts);
    expect(
      collapseAssistantReplayContent([
        { type: 'text', text: 'one' },
        { type: 'text', text: 'two' },
      ]),
    ).toBe('one\ntwo');
  });
});
