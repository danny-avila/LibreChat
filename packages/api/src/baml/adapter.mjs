/**
 * The single ESM module in this package.
 *
 * Everything BAML-shaped is confined here: the generated `baml_ts` SDK is ESM
 * (`baml_ts/package.json` → `"type": "module"`) and `@boundaryml/baml-bridge`
 * publishes an `import` condition only, with no `require`. This package is
 * CommonJS. The boundary is crossed at *this file* rather than at a package
 * export, because Node resolves a local `.mjs` by extension and never consults
 * an exports map — so CJS callers may `require('./adapter.mjs')` on Node >= 22.12
 * and reach the bridge through a normal ESM graph.
 *
 * Keep `await import()` in mind as the fallback: `require(esm)` throws
 * `ERR_REQUIRE_ASYNC_MODULE` if anything in the graph ever adopts top-level
 * await. The generated SDK does not today.
 *
 * Implements `BamlFunctionSet` from `@librechat/agents/baml`. See
 * `docs/providers/baml.md` in that package for the contract; three of its
 * examples do not run on bridge 0.15.0 and the departures are marked below.
 */

import { createHash } from 'node:crypto';

import { BamlCallContext } from '@boundaryml/baml-bridge';
import { BAML_PORT_VERSION } from '@librechat/agents/baml';

import { host } from '../../../../baml_ts/dist/index.js';

const TOOL_ROLE = 'tool';
const USER_ROLE = 'user';

/**
 * Mirrors the compiled union in `baml_src/ns_host/turn.baml`. Hand-maintained
 * in step with that file: the fingerprint's job is to detect drift between the
 * schema a caller *binds* and the schema BAML *compiled*, and the compiled
 * schema is not reachable offline — `$render_prompt` returns an opaque AST and
 * `$build_request` requires credentials.
 */
const COMPILED_TOOLS = [
  { name: 'get_weather', fields: { tool: 'literal:get_weather', city: 'string' } },
  { name: 'web_search', fields: { tool: 'literal:web_search', query: 'string' } },
];

const fingerprint = (fields) =>
  `sha256:${createHash('sha256').update(JSON.stringify(fields)).digest('hex').slice(0, 32)}`;

const DECLARED_TOOLS = Object.freeze(
  COMPILED_TOOLS.map((t) => Object.freeze({ name: t.name, schemaFingerprint: fingerprint(t.fields) })),
);

class BamlAbortError extends Error {
  constructor() {
    super('BAML turn aborted');
    this.name = 'AbortError';
  }
}

/**
 * Transport and abort are the only permitted rejections; everything else is a
 * failure *value*.
 *
 * `baml.errors.LlmClient` straddles the line: it covers both a genuinely failed
 * request AND a request that succeeded but whose body did not match the return
 * type. The second is the model writing something unparseable — a per-turn
 * failure, not a transport fault — and rejecting for it would take down a turn
 * the contract says should surface as a value. Observed shape:
 *
 *   baml.errors.LlmClient: <root>: Expected user.host.TurnPlan, got String(...)
 *
 * Class name alone cannot separate them, so the coercion shape is matched.
 */
const TRANSPORT_ERRORS = new Set([
  'baml.errors.Io',
  'baml.errors.LlmClient',
  'baml.errors.Timeout',
]);

const COERCION_FAILURE = /Expected .+, got /;

const isAbortError = (error) =>
  error?.name === 'AbortError' || `${error?.className ?? ''}`.includes('Cancelled');

const isParseError = (error) => COERCION_FAILURE.test(`${error?.message ?? ''}`);

const isTransportError = (error) => TRANSPORT_ERRORS.has(error?.className) && !isParseError(error);

const failureOf = (error, code) => ({
  kind: 'failure',
  failure: { code, message: `${error?.message ?? error}`.split('\n')[0] },
});

/** Entry guard. `BaseChatModel` enters the generator body before checking the
 * signal, so without this an already-aborted call still issues a live request.
 * Matches the pre-aborted `$ctx` measurement: reject at 0ms, no request. */
const assertNotAborted = (signal) => {
  if (signal?.aborted) throw new BamlAbortError();
};

/**
 * Departure from docs §3, which passes `{ signal: input.signal }`. The bridge
 * recognizes exactly two option keys, `$ctx` and `$types`; anything else throws
 * `unknown optional argument`. An `AbortSignal` reaches BAML only by way of a
 * `BamlCallContext`.
 */
const callContextFor = (signal) => {
  const ctx = new BamlCallContext();
  if (!signal) return { ctx, release: () => {} };
  const onAbort = () => ctx.abort();
  signal.addEventListener('abort', onAbort, { once: true });
  return { ctx, release: () => signal.removeEventListener('abort', onAbort) };
};

const isToolEntry = (entry) => entry.role === TOOL_ROLE;

const textOf = (content) => (typeof content === 'string' ? content : JSON.stringify(content ?? ''));

/**
 * The bridge lowers an array of class instances to maps and panics
 * (`expected instance, got map`), so tool results cross as parallel primitive
 * arrays and BAML reassembles them. That is what `host_transcript` is for.
 */
const buildTranscript = async (entries, ctx) => {
  const names = [];
  const args = [];
  const results = [];
  const lines = [];

  for (const entry of entries) {
    if (!isToolEntry(entry)) {
      lines.push(`${entry.role}: ${textOf(entry.content)}`);
      continue;
    }
    const call = entries
      .flatMap((e) => e.toolCalls ?? [])
      .find((c) => c.id === entry.toolCallId);
    names.push(call?.name ?? 'unknown');
    args.push(JSON.stringify(call?.args ?? {}));
    results.push(textOf(entry.content));
  }

  const toolText = names.length ? await host.host_transcript_async(names, args, results, { $ctx: ctx }) : '';
  return [lines.join('\n'), toolText].filter(Boolean).join('\n');
};

const lastUserMessage = (entries) => {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].role === USER_ROLE) return textOf(entries[i].content);
  }
  return '';
};

/** The host reads the literal discriminator as a plain field. A union-typed
 * BAML parameter cannot discriminate a host map — it coerces into the first
 * variant and throws. */
const toSelectedTool = (selection) => {
  const { tool, ...args } = selection;
  return { name: tool, args };
};

/**
 * `meta` may never be fabricated, and `UsageMetadata` needs both counts — a
 * half-record would force a zero that under-reports cost. So: both or nothing.
 */
const readMeta = (stream) => {
  const acc = stream?._acc;
  if (!acc) return undefined;
  try {
    const inputTokens = acc.input_tokens();
    const outputTokens = acc.output_tokens();
    if (typeof inputTokens !== 'number' || typeof outputTokens !== 'number') return undefined;
    return {
      inputTokens,
      outputTokens,
      model: acc.model() ?? undefined,
      finishReason: acc.finish_reason() ?? undefined,
    };
  } catch {
    return undefined;
  }
};

export const createBamlFunctionSet = () => ({
  version: BAML_PORT_VERSION,
  declaredTools: DECLARED_TOOLS,

  async takeTurn(input) {
    assertNotAborted(input.signal);
    const { ctx, release } = callContextFor(input.signal);
    try {
      const transcript = await buildTranscript(input.transcript, ctx);
      const message = lastUserMessage(input.transcript);

      const plan = await host.HostTurn_async(message, transcript, { $ctx: ctx });
      assertNotAborted(input.signal);

      if (plan?.tools?.length) {
        return { kind: 'tool_calls', calls: plan.tools.map(toSelectedTool), failures: [] };
      }

      return { kind: 'answer', text: plan?.reply ?? '' };
    } catch (error) {
      if (isAbortError(error)) throw new BamlAbortError();
      if (isTransportError(error)) throw error;
      return failureOf(error, isParseError(error) ? 'parse_error' : 'model_error');
    } finally {
      release();
    }
  },

  async *streamTurn(input) {
    assertNotAborted(input.signal);
    const { ctx, release } = callContextFor(input.signal);
    try {
      const transcript = await buildTranscript(input.transcript, ctx);
      const message = lastUserMessage(input.transcript);

      const stream = await host['HostTurn$stream_async'](message, transcript, { $ctx: ctx });

      // Departure from docs §3, which uses `for await`. `BamlStream` exposes
      // only next/nextAsync/final/finalAsync — no `Symbol.asyncIterator`, no
      // `close`. An explicit pull loop is the only option, and a `finally`
      // cannot close the stream.
      let emitted = '';
      let toolTurn = false;
      for (;;) {
        const partial = await stream.nextAsync();

        // Abort resolves the pending read with an EMPTY value rather than
        // rejecting, so it is indistinguishable from an empty partial here.
        // The adapter has to synthesize the rejection or it would report a
        // successful empty turn on cancel.
        assertNotAborted(input.signal);

        if (partial === null || partial === undefined) break;

        // A tool turn is structured: emitting a half-built call would dispatch
        // arguments the model has not finished writing. Wait for the final value.
        if (partial.tools?.length) {
          toolTurn = true;
          continue;
        }

        // Partials are snapshots, not suffixes — forwarding one whole would
        // duplicate persisted text, since deltas are aggregated in the same pass.
        const snapshot = typeof partial.reply === 'string' ? partial.reply : '';
        if (snapshot.length <= emitted.length) continue;
        const delta = snapshot.startsWith(emitted) ? snapshot.slice(emitted.length) : snapshot;
        emitted = snapshot;
        yield { kind: 'text', text: delta };
      }

      // Deliberately NOT awaited on the abort path: `finalAsync()` ignores the
      // abort and blocks for the full remaining stream duration.
      const plan = await stream.finalAsync();
      assertNotAborted(input.signal);

      const meta = readMeta(stream);

      if (toolTurn || plan?.tools?.length) {
        yield { kind: 'tool_calls', calls: (plan?.tools ?? []).map(toSelectedTool), failures: [], ...(meta ? { meta } : {}) };
        return;
      }

      const finalText = typeof plan?.reply === 'string' ? plan.reply : '';
      const tail = finalText.length > emitted.length ? finalText.slice(emitted.length) : '';
      if (tail || meta) yield { kind: 'text', text: tail, ...(meta ? { meta } : {}) };
    } catch (error) {
      if (isAbortError(error)) throw new BamlAbortError();
      if (isTransportError(error)) throw error;
      yield failureOf(error, isParseError(error) ? 'parse_error' : 'model_error');
    } finally {
      release();
    }
  },
});

export { DECLARED_TOOLS };
