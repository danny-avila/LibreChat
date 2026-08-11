import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHILD_MARKER = 'BAML_COMPILED_CONSUMER_CHILD';
const TRACE_FILE = 'BAML_COMPILED_CONSUMER_TRACE';
const WATCHDOG_MS = 30_000;

const traceHook = `
import { appendFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { threadId } from 'node:worker_threads';
const traceFile = process.env.${TRACE_FILE};
registerHooks({
  resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context);
    const resolved = String(result?.url ?? '');
    if (
      specifier.includes('@boundaryml/baml-bridge') ||
      specifier.includes('/baml/generated/') ||
      resolved.includes('/dist/baml/')
    ) {
      appendFileSync(traceFile, JSON.stringify({ threadId, specifier, resolved }) + '\\n');
    }
    return result;
  },
});
`;

if (process.env[CHILD_MARKER] !== '1') {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'baml-consumer-trace-'));
  const traceFile = path.join(temporary, 'modules.jsonl');
  const hookUrl = `data:text/javascript,${encodeURIComponent(traceHook)}`;
  const result = spawnSync(
    process.execPath,
    ['--import', hookUrl, import.meta.filename, ...process.argv.slice(2)],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: WATCHDOG_MS,
      env: {
        ...process.env,
        [CHILD_MARKER]: '1',
        [TRACE_FILE]: traceFile,
      },
    },
  );
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  rmSync(temporary, { force: true, recursive: true });
  process.exit(result.status ?? 1);
}

const parseMode = () => {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--mode' || !['non-baml', 'baml'].includes(args[1])) {
    throw new Error('Usage: baml-compiled-consumer.mjs --mode non-baml | --mode baml');
  }
  return args[1];
};

const dist = path.resolve(
  process.env.BAML_DIST_DIR ?? path.join(import.meta.dirname, '..', 'dist'),
);
const require = createRequire(import.meta.url);
const api = require(path.join(dist, 'index.cjs'));

const db = {
  getUserKey: async () => {
    throw new Error('compiled consumer must not read a user key');
  },
  getUserKeyValues: async () => {
    throw new Error('compiled consumer must not read user key values');
  },
};

const trace = () => {
  try {
    return readFileSync(process.env[TRACE_FILE], 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
};

const waitFor = async (predicate, description) => {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${description}`);
};

const runNonBaml = async () => {
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.BAML_OPENROUTER_BASE_URL;
  process.env.OPENAI_API_KEY = 'compiled-consumer-key';

  const initialized = await api.initializeOpenAI({
    req: { body: {}, config: {}, user: { id: 'compiled-consumer' } },
    endpoint: 'openAI',
    model_parameters: { model: 'gpt-4o-mini' },
    db,
  });

  assert.equal(initialized.llmConfig.model, 'gpt-4o-mini');
  const native = trace().filter(
    (entry) =>
      entry.specifier.includes('@boundaryml/baml-bridge') ||
      entry.specifier.includes('/baml/generated/') ||
      entry.resolved.includes('/dist/baml/'),
  );
  assert.deepEqual(native, [], 'ordinary initialization must not resolve the BAML graph');
  process.stdout.write('compiled consumer non-baml: native graph remained unresolved\n');
};

const createProvider = () => {
  const requests = [];
  const server = createServer((request, response) => {
    let raw = '';
    request.on('data', (chunk) => {
      raw += chunk;
    });
    request.on('end', () => {
      const body = JSON.parse(raw || '{}');
      requests.push(body);
      const content = JSON.stringify({ reply: 'Compiled BAML response.', tools: [] });
      const payload = JSON.stringify({
        id: 'chatcmpl-compiled-consumer',
        object: 'chat.completion',
        created: 0,
        model: 'fixture',
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      });
      response.writeHead(200, {
        'content-length': Buffer.byteLength(payload),
        'content-type': 'application/json',
      });
      response.end(payload);
    });
  });

  return {
    requests,
    listen: () =>
      new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const address = server.address();
          assert.ok(address && typeof address !== 'string');
          resolve(`http://127.0.0.1:${address.port}/v1`);
        });
      }),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

const runBaml = async () => {
  const provider = createProvider();
  const baseUrl = await provider.listen();
  process.env.OPENROUTER_API_KEY = 'compiled-consumer-key';
  process.env.BAML_OPENROUTER_BASE_URL = baseUrl;

  try {
    const endpoint = {
      name: 'Team-BAML',
      provider: 'baml',
      models: { default: ['OpenRouter'], fetch: false },
    };
    const params = {
      req: {
        body: {},
        config: { endpoints: { custom: [endpoint] } },
        user: { id: 'compiled-consumer' },
      },
      endpoint: endpoint.name,
      model_parameters: { model: 'OpenRouter' },
      db,
    };
    const [first, second] = await Promise.all([
      api.initializeCustom(params),
      api.initializeCustom(params),
    ]);

    assert.equal(first.provider, 'baml');
    assert.equal(second.provider, 'baml');
    const input = {
      version: 1,
      transcript: [{ role: 'user', content: 'Use the compiled package.' }],
      allowedTools: [],
    };
    const results = await Promise.all([
      first.runtimeOptions.functions.takeTurn(input),
      second.runtimeOptions.functions.takeTurn(input),
    ]);

    assert.deepEqual(
      results.map((result) => result.kind),
      ['answer', 'answer'],
    );
    assert.deepEqual(
      results.map((result) => result.text),
      ['Compiled BAML response.', 'Compiled BAML response.'],
    );
    assert.equal(provider.requests.length, 2);
    assert.ok(provider.requests.every((request) => request.model === 'openai/gpt-oss-120b'));

    const entries = await waitFor(() => {
      const current = trace();
      const workerThreads = new Set(
        current
          .filter(
            (entry) => entry.threadId !== 0 && entry.specifier.includes('@boundaryml/baml-bridge'),
          )
          .map((entry) => entry.threadId),
      );
      return workerThreads.size === 2 ? current : null;
    }, 'two worker-owned native module graphs');

    const parentFacadeLoads = entries.filter(
      (entry) => entry.threadId === 0 && entry.resolved.endsWith('/dist/baml/runtime.mjs'),
    );
    const parentNativeLoads = entries.filter(
      (entry) =>
        entry.threadId === 0 &&
        (entry.specifier.includes('@boundaryml/baml-bridge') ||
          entry.specifier.includes('/baml/generated/')),
    );
    const workerNativeThreads = new Set(
      entries
        .filter(
          (entry) => entry.threadId !== 0 && entry.specifier.includes('@boundaryml/baml-bridge'),
        )
        .map((entry) => entry.threadId),
    );

    assert.equal(parentFacadeLoads.length, 1, 'concurrent initialization must load one facade');
    assert.deepEqual(parentNativeLoads, [], 'the parent must never own the native graph');
    assert.equal(workerNativeThreads.size, 2, 'each operation must own one native worker graph');
    process.stdout.write('compiled consumer baml: one facade, two worker-owned native graphs\n');
  } finally {
    await provider.close();
  }
};

const watchdog = setTimeout(() => {
  process.stderr.write(`compiled consumer exceeded ${WATCHDOG_MS}ms\n`);
  process.exit(1);
}, WATCHDOG_MS);
watchdog.unref();

await (parseMode() === 'non-baml' ? runNonBaml() : runBaml());
