import { EJSON } from 'bson';
import { Providers } from 'librechat-data-provider';
import type { Agents } from 'librechat-data-provider';
import { buildPendingAction, toClientPendingAction, captureResumeModelParameters } from './policy';

/**
 * Behavior 2.2 — runtime values cannot cross persistence/DTO boundaries.
 *
 * Resume capture is the one place a BAML turn's candidate state (the request body
 * plus the resolved `model_parameters`) is frozen for durable replay. It is also
 * the place a generated function set, a native client, an abort signal, a BAML
 * context, or a stale provider generation field could ride into a pending action,
 * a Mongo document, and a public DTO if capture merely dropped function-valued
 * leaves.
 *
 * These tests drive the real capture and the real persistence/projection helpers.
 * The BAML arm is schema-OWNED: it keeps exactly the BAML conversation picks and
 * nothing else — not the otherwise-serializable `version`/`declaredTools` members
 * of a function set, and not a single provider generation key. The non-BAML arm
 * still hard-denies the executable-runtime keys structurally, so the guarantee is
 * a property of capture rather than of any one schema.
 */

/** A function set as it actually looks: serializable metadata wrapping live functions. */
const functionSet = {
  version: 1,
  declaredTools: [{ name: 'get_weather', schemaFingerprint: 'sha256:abc' }],
  takeTurn: async () => ({ kind: 'answer' as const, text: '' }),
  streamTurn: async function* () {},
};

/**
 * Everything a BAML resume must never carry, nested exactly where it would appear
 * if the initializer's executable state leaked into `model_parameters`: the live
 * function set, the split `runtimeOptions` envelope, a native client and its
 * factory, the compiled registry, a BAML call context, an abort signal, and the
 * stale provider generation fields BAML compiles away.
 */
const runtimeLadenResolvedParams = () => ({
  model: 'OpenRouter',
  functions: { ...functionSet },
  runtimeOptions: { functions: { ...functionSet } },
  client: { $new: () => undefined, config: { token: 'native-secret' } },
  createClient: () => undefined,
  registry: new Map([['OpenRouter', { take: () => undefined }]]),
  context: { bamlCtx: true, tags: {} },
  signal: new AbortController().signal,
  temperature: 0.7,
  top_p: 0.9,
  topP: 0.9,
  topK: 40,
  max_tokens: 2048,
  maxTokens: 2048,
  max_output_tokens: 2048,
  maxOutputTokens: 2048,
  max_completion_tokens: 2048,
  reasoning_effort: 'high',
  stop: ['END'],
});

/** Identity/conversation body a paused BAML turn actually sends. */
const bamlBody = () => ({
  text: 'hello',
  conversationId: 'conv-1',
  model: 'OpenRouter',
  spec: 'team-spec',
  modelLabel: 'Team Router',
  promptPrefix: 'be terse',
  iconURL: 'https://cdn/icon.png',
  greeting: 'hi',
  chatProjectId: 'proj-1',
  resendFiles: true,
  artifacts: 'default',
  disableStreaming: true,
  maxContextTokens: 40000,
  fileTokenLimit: 1000,
  temperature: 0.4,
});

/** The exact set a BAML resume is allowed to persist: conversation picks, no more. */
const EXPECTED_BAML_CAPTURE = {
  resendFiles: true,
  artifacts: 'default',
  disableStreaming: true,
  maxContextTokens: 40000,
  fileTokenLimit: 1000,
};

/** Keys that must never survive capture, whatever the provider. */
const RUNTIME_ONLY_KEYS = [
  'functions',
  'runtimeOptions',
  'client',
  'createClient',
  'registry',
  'context',
  'signal',
];

/** Serializable function-set members that an allowlist must still drop. */
const FUNCTION_SET_MEMBERS = ['version', 'declaredTools', 'takeTurn', 'streamTurn'];

/** BAML compiles these away; a resume must not smuggle them back. */
const STALE_GENERATION_KEYS = [
  'temperature',
  'top_p',
  'topP',
  'topK',
  'max_tokens',
  'maxTokens',
  'max_output_tokens',
  'maxOutputTokens',
  'max_completion_tokens',
  'reasoning_effort',
  'stop',
];

const keySet = (value: unknown): Set<string> => {
  const keys = new Set<string>();
  const walk = (node: unknown): void => {
    if (node == null || typeof node !== 'object') {
      return;
    }
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      keys.add(key);
      walk(child);
    }
  };
  walk(value);
  return keys;
};

describe('captureResumeModelParameters — BAML is schema-owned', () => {
  it('keeps only the BAML conversation picks, dropping runtime and stale generation state', () => {
    const captured = captureResumeModelParameters(bamlBody(), runtimeLadenResolvedParams(), {
      provider: Providers.BAML,
    });

    expect(captured).toEqual(EXPECTED_BAML_CAPTURE);
  });

  it('drops the otherwise-serializable version and declaredTools members', () => {
    const captured = captureResumeModelParameters(bamlBody(), runtimeLadenResolvedParams(), {
      provider: Providers.BAML,
    });
    const present = keySet(captured);

    for (const key of [...FUNCTION_SET_MEMBERS, ...RUNTIME_ONLY_KEYS, ...STALE_GENERATION_KEYS]) {
      expect(present.has(key)).toBe(false);
    }
  });

  it('never overlays the global provider request-key union for BAML', () => {
    // The stale fields live in BOTH inputs; a union-based capture would keep them.
    const captured = captureResumeModelParameters(
      { temperature: 0.4, maxOutputTokens: 8192, stop: ['END'], resendFiles: true },
      { temperature: 0.7, top_p: 0.9, model: 'OpenRouter' },
      { provider: Providers.BAML },
    );

    expect(captured).toEqual({ resendFiles: true });
  });

  it('returns undefined when nothing survives the BAML schema', () => {
    const captured = captureResumeModelParameters(
      { text: 'hi', model: 'OpenRouter', temperature: 0.7 },
      { functions: { ...functionSet }, temperature: 0.5 },
      { provider: Providers.BAML },
    );

    expect(captured).toBeUndefined();
  });
});

describe('captureResumeModelParameters — runtime keys are hard-denied for every provider', () => {
  it('drops executable-runtime keys even on a non-BAML capture', () => {
    const captured = captureResumeModelParameters(
      { temperature: 0.4 },
      runtimeLadenResolvedParams(),
      { provider: Providers.OPENAI },
    );
    const present = keySet(captured);

    // A non-BAML provider legitimately keeps generation params (body wins, 0.4)...
    expect(captured?.temperature).toBe(0.4);
    // ...but never the executable-runtime state or its serializable members.
    for (const key of [...RUNTIME_ONLY_KEYS, ...FUNCTION_SET_MEMBERS]) {
      expect(present.has(key)).toBe(false);
    }
  });

  it('leaves the established two-argument (non-BAML) contract unchanged', () => {
    // Regression: the pre-existing call shape must behave exactly as before.
    expect(
      captureResumeModelParameters(
        { maxOutputTokens: 8192, stop: ['END'], temperature: 0.3 },
        { model: 'claude-opus-4', temperature: 0.3, maxTokens: 8192, stopSequences: ['END'] },
      ),
    ).toEqual({
      model: 'claude-opus-4',
      temperature: 0.3,
      maxTokens: 8192,
      stopSequences: ['END'],
      maxOutputTokens: 8192,
      stop: ['END'],
    });
  });
});

describe('Behavior 2.2 — persistence and DTO boundaries carry no runtime state', () => {
  // Structural, not substring: assert the KEY SET after a real round-trip so a runtime
  // key anywhere in the record fails, while a payload value that merely contains the
  // word "client" (e.g. the question text) does not produce a false positive.
  const forbiddenKeys = [...FUNCTION_SET_MEMBERS, ...RUNTIME_ONLY_KEYS, ...STALE_GENERATION_KEYS];

  const pausePayloads: Agents.HumanInterruptPayload[] = [
    {
      type: 'tool_approval',
      action_requests: [{ name: 'shell', arguments: { command: 'ls' }, tool_call_id: 'call_1' }],
      review_configs: [
        { action_name: 'shell', tool_call_id: 'call_1', allowed_decisions: ['approve', 'reject'] },
      ],
    },
    { type: 'ask_user_question', question: { question: 'Which client?' } },
  ];

  it.each(pausePayloads.map((p) => [p.type, p] as const))(
    'persists a %s pause with a runtime-free, BSON/JSON-safe model_parameters',
    (_type, payload) => {
      const model_parameters = captureResumeModelParameters(
        bamlBody(),
        runtimeLadenResolvedParams(),
        { provider: Providers.BAML },
      );
      expect(model_parameters).toEqual(EXPECTED_BAML_CAPTURE);

      const pending = buildPendingAction(payload, {
        streamId: 'stream-1',
        conversationId: 'conv-1',
        resumeContext: { endpoint: 'Team-BAML', model_parameters },
      });

      // JSON write path and BSON (Mongo) write path both round-trip clean.
      const viaJson = JSON.parse(JSON.stringify(pending));
      const viaBson = EJSON.parse(EJSON.stringify(EJSON.serialize(pending)));
      const jsonKeys = keySet(viaJson);
      const bsonKeys = keySet(viaBson);
      for (const key of forbiddenKeys) {
        expect(jsonKeys.has(key)).toBe(false);
        expect(bsonKeys.has(key)).toBe(false);
      }
      // The BAML picks did survive the write (the record is not merely empty).
      expect(viaJson.resumeContext.model_parameters as Record<string, unknown>).toEqual(
        EXPECTED_BAML_CAPTURE,
      );

      // The public projection drops the whole server-only replay envelope.
      const clientSafe = toClientPendingAction(pending);
      expect(clientSafe?.resumeContext).toBeUndefined();
      expect(keySet(clientSafe).has('model_parameters')).toBe(false);
    },
  );
});
