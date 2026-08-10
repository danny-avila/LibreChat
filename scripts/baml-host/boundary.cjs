/**
 * Proves the module boundary the adapter depends on, from a CommonJS file —
 * which is what `packages/api` and `api/` actually are.
 *
 *   node scripts/baml-host/boundary.cjs
 *
 * Offline: constructs the port and the model, makes no provider request.
 */

require('@librechat/agents/baml');
const { Providers, getChatModelClass, initializeModel } = require('@librechat/agents');

const line = (s = '') => console.log(s);
let failures = 0;
const check = (cond, label) => {
  if (cond) return line(`   \x1b[32m✓\x1b[0m ${label}`);
  failures += 1;
  line(`   \x1b[31m✗ ${label}\x1b[0m`);
};

(async () => {
  check(Providers.BAML === 'baml', 'CJS require of the ./baml entry registered the provider');
  check(getChatModelClass(Providers.BAML)?.name === 'ChatBAML', 'getChatModelClass resolves ChatBAML');

  // The CJS -> ESM crossing happens at a local .mjs file, resolved by extension
  // rather than through an exports map. `require(esm)` is unflagged on Node >= 22.12;
  // `await import()` is the fallback if the ESM graph ever adopts top-level await.
  const { createBamlFunctionSet, DECLARED_TOOLS } = await import('../../packages/api/src/baml/adapter.mjs');
  check(typeof createBamlFunctionSet === 'function', 'CJS reached the ESM adapter, which imports the ESM-only bridge');

  const functions = createBamlFunctionSet();
  check(functions.version === 1, 'the port declares BAML_PORT_VERSION 1');
  check(DECLARED_TOOLS.length > 0, `declaredTools is populated (${DECLARED_TOOLS.map((t) => t.name).join(', ')})`);

  const model = initializeModel({ provider: Providers.BAML, clientOptions: { functions } });
  check(model.constructor.name === 'ChatBAML', 'initializeModel built a ChatBAML from CJS');

  line();
  line(failures === 0 ? `\x1b[32mPASS\x1b[0m — CJS/ESM boundary holds` : `\x1b[31mFAIL\x1b[0m — ${failures} check(s)`);
  process.exit(failures === 0 ? 0 : 1);
})();
