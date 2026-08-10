/**
 * Native-load smoke test, to run INSIDE the built Linux image.
 *
 *   docker run --rm -v "$PWD/scripts/baml-host/smoke.cjs:/app/smoke.cjs:ro" \
 *     -w /app <image> node smoke.cjs
 *
 * The bridge is a napi native addon with eight platform targets and the image
 * is Alpine (musl). A `require()` probe on the host proves nothing about it.
 * This is the Phase 0 gate: does the exported runner load and execute inside
 * the deployment image?
 *
 * Fully offline — `host_transcript` is a pure BAML function with no LLM call,
 * so this needs no key, makes no request, and costs nothing.
 */

const line = (s = '') => console.log(s);
let failures = 0;
const check = (cond, label) => {
  if (cond) return line(`   \x1b[32m✓\x1b[0m ${label}`);
  failures += 1;
  line(`   \x1b[31m✗ ${label}\x1b[0m`);
};

(async () => {
  line(`platform: ${process.platform}/${process.arch}  node ${process.version}`);
  line(`libc    : ${process.report?.getReport?.()?.header?.glibcVersionRuntime ? 'glibc' : 'musl (no glibc reported)'}`);
  line();

  check(require('fs').existsSync('/app/baml_ts/dist/index.js'), 'baml_ts/dist reached the image');
  check(require('fs').existsSync('/app/packages/api/src/baml/adapter.mjs'), 'the host adapter reached the image');

  require('@librechat/agents/baml');
  const { Providers, getChatModelClass, initializeModel } = require('@librechat/agents');
  check(Providers.BAML === 'baml', 'CJS require registered Providers.BAML');
  check(getChatModelClass(Providers.BAML)?.name === 'ChatBAML', 'getChatModelClass resolves ChatBAML');

  // The load-bearing line: this pulls in the ESM bridge, which dlopen()s the
  // platform-specific .node binary. If musl resolution is broken, it fails here.
  const { createBamlFunctionSet } = await import('/app/packages/api/src/baml/adapter.mjs');
  check(typeof createBamlFunctionSet === 'function', 'the native bridge loaded under this libc');

  // Execute a real BAML function offline — proves the runtime actually runs,
  // not merely that the addon loaded.
  const { host } = await import('/app/baml_ts/dist/index.js');
  const rendered = await host.host_transcript_async(['get_weather'], ['{"city":"Denver"}'], ['24C']);
  check(rendered.includes('get_weather') && rendered.includes('24C'), `a BAML function executed in-image -> ${JSON.stringify(rendered)}`);

  const functions = createBamlFunctionSet();
  const model = initializeModel({ provider: Providers.BAML, clientOptions: { functions } });
  check(model.constructor.name === 'ChatBAML', 'ChatBAML constructed from the port inside the image');

  line();
  line(failures === 0 ? `\x1b[32mPASS\x1b[0m — native load + offline execution green in-image` : `\x1b[31mFAIL\x1b[0m — ${failures} check(s)`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  line(`\x1b[31mTHREW\x1b[0m ${e?.message ?? e}`);
  line(String(e?.stack ?? '').split('\n').slice(1, 6).join('\n'));
  process.exit(1);
});
