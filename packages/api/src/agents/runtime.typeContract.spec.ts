import { Providers } from '@librechat/agents';
import type { BamlFunctionSet } from '@librechat/agents/baml';
import type { ClientOptions } from '@librechat/agents';
import type { InitializeResultBase, BamlInitializeResult, StandardInitializeResult } from '~/types';
import { isBamlInitializeResult } from '~/types';

/**
 * Behavior 2.1 (type contract) — the initializer result union keeps the EXECUTABLE
 * port (`runtimeOptions.functions`) structurally separate from the declarative
 * `llmConfig` that gets persisted, so a whole class of leak fails `tsc` rather than
 * surfacing at runtime far from here.
 *
 * The assertions are the `@ts-expect-error` lines: each marks a construction the union
 * must reject. If the types drifted so any of them started compiling, the unused
 * directive would fail `tsc -p tsconfig.spec.json`. The runtime `expect`s exist only so
 * Jest sees real tests and the narrowing is exercised, not merely declared.
 *
 * What the union does NOT enforce, verified rather than assumed: it cannot reject a
 * stray `functions` key placed directly in `llmConfig`. `BamlClientOptions` extends
 * `BaseChatModelParams`, which is structurally open, so `Omit<BamlClientOptions,
 * 'functions'>` still accepts arbitrary excess keys — a `@ts-expect-error` on such a
 * construction would be UNUSED and fail the typecheck. That boundary is behavioral, not
 * type-level: `initializeAgent` writes only declarative `llmConfig`, the executable port
 * rides the symbol-keyed runtime carrier (`runtime-carrier.test.ts`), and resume capture
 * is schema-owned (`hitl/resumeCapture.spec.ts`). The type contract owns the arm shape;
 * those suites own the value boundary.
 */

const aFunctionSet = {} as unknown as BamlFunctionSet;

describe('initializer result union — compile-time contract', () => {
  it('accepts a BAML result that splits llmConfig from runtimeOptions', () => {
    const result: BamlInitializeResult = {
      provider: Providers.BAML,
      llmConfig: { model: 'OpenRouter' },
      runtimeOptions: { functions: aFunctionSet },
    };

    expect(result.runtimeOptions.functions).toBe(aFunctionSet);
    expect(isBamlInitializeResult(result)).toBe(true);
  });

  it('rejects a BAML result that omits runtimeOptions', () => {
    // @ts-expect-error — runtimeOptions is required on the BAML arm; omitting it is the
    // exact leak the split exists to prevent (executable state falling back into llmConfig).
    const missingRuntime: BamlInitializeResult = {
      provider: Providers.BAML,
      llmConfig: { model: 'OpenRouter' },
    };

    expect(missingRuntime.provider).toBe(Providers.BAML);
  });

  it('gives the executable port exactly one typed home: runtimeOptions.functions', () => {
    const result: BamlInitializeResult = {
      provider: Providers.BAML,
      llmConfig: { model: 'OpenRouter' },
      runtimeOptions: { functions: aFunctionSet },
    };

    // `runtimeOptions.functions` is required and typed as the port; there is a single,
    // declared place for executable state. (`llmConfig` cannot be made to REJECT a stray
    // `functions` — see the file header — so keeping it off `model_parameters` is owned
    // by the carrier and by 2.2's schema-owned capture, not by this type.)
    const port: BamlFunctionSet = result.runtimeOptions.functions;
    expect(port).toBe(aFunctionSet);
  });

  it('rejects a non-BAML result that carries runtimeOptions', () => {
    const result: StandardInitializeResult = {
      provider: Providers.OPENAI,
      llmConfig: { model: 'gpt-4o' } as ClientOptions,
      // @ts-expect-error — the standard arm types runtimeOptions as `never`, so an
      // ordinary provider cannot acquire executable BAML state.
      runtimeOptions: { functions: aFunctionSet },
    };

    expect(result.provider).toBe(Providers.OPENAI);
  });

  it('keeps the existing-provider arm assignable from a plain ClientOptions, no cast at the result', () => {
    const llmConfig = { model: 'gpt-4o' } as ClientOptions;
    // The union does not force an `as ClientOptions` at the assignment site — the
    // existing arm's llmConfig IS ClientOptions.
    const result: StandardInitializeResult = { provider: Providers.OPENAI, llmConfig };

    expect(result.llmConfig).toBe(llmConfig);
  });

  it('narrows on runtimeOptions, not on a plain-string provider', () => {
    const results: InitializeResultBase[] = [
      {
        provider: Providers.BAML,
        llmConfig: { model: 'OpenRouter' },
        runtimeOptions: { functions: aFunctionSet },
      },
      { provider: Providers.OPENAI, llmConfig: { model: 'gpt-4o' } as ClientOptions },
      { llmConfig: { model: 'gpt-4o' } as ClientOptions },
    ];

    expect(results.filter(isBamlInitializeResult)).toHaveLength(1);
  });
});
