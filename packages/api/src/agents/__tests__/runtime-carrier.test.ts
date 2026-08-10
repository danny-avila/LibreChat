import { EJSON } from 'bson';
import { Providers } from '@librechat/agents';
import type { BamlFunctionSet } from '@librechat/agents/baml';
import type { InitializeResultBase } from '~/types';
import {
  AGENT_RUNTIME_CARRIER,
  getAgentRuntimeOptions,
  setAgentRuntimeOptions,
} from '~/agents/runtime';
import { isBamlInitializeResult } from '~/types';

/**
 * Behaviors 2.1 and 2.2 — executable runtime state is reachable from the run
 * boundary and absent from every serializing surface.
 *
 * The carrier's whole value is that no downstream writer has to remember to
 * strip it, so the assertions here are the ones a writer would otherwise have to
 * make: spread, `Object.keys`, `JSON.stringify`, and BSON.
 */

const functions = {
  version: 1,
  declaredTools: [{ name: 'get_weather', schemaFingerprint: 'sha256:abc' }],
  takeTurn: async () => ({ kind: 'answer' as const, text: '' }),
  streamTurn: async function* () {},
} as unknown as BamlFunctionSet;

const initializedAgent = () =>
  setAgentRuntimeOptions(
    {
      id: 'agent-1',
      provider: Providers.BAML,
      endpoint: 'Team-BAML',
      model_parameters: { model: 'OpenRouter' },
    },
    { functions },
  );

describe('agent runtime carrier', () => {
  it('returns the exact function set to the run boundary', () => {
    expect(getAgentRuntimeOptions(initializedAgent())?.functions).toBe(functions);
  });

  it('returns undefined for an agent that never carried runtime options', () => {
    expect(getAgentRuntimeOptions({ id: 'agent-2' })).toBeUndefined();
    expect(getAgentRuntimeOptions(undefined)).toBeUndefined();
    expect(getAgentRuntimeOptions(null)).toBeUndefined();
  });

  it('is invisible to enumeration and object spread', () => {
    const agent = initializedAgent();

    expect(Object.keys(agent)).toEqual(['id', 'provider', 'endpoint', 'model_parameters']);
    expect(Object.getOwnPropertyNames(agent)).not.toContain('runtimeOptions');
    expect(getAgentRuntimeOptions({ ...agent })).toBeUndefined();
  });

  it('survives no serialization boundary', () => {
    const agent = initializedAgent();

    const json = JSON.stringify(agent);
    expect(json).not.toContain('functions');
    expect(json).not.toContain('declaredTools');
    expect(json).not.toContain('takeTurn');

    const roundTripped = JSON.parse(json) as Record<string, unknown>;
    expect(getAgentRuntimeOptions(roundTripped)).toBeUndefined();

    const bson = EJSON.stringify(EJSON.serialize(agent));
    expect(bson).not.toContain('functions');
    expect(bson).not.toContain('declaredTools');
  });

  it('keeps two agents independent', () => {
    const first = initializedAgent();
    const other = {} as Record<string, unknown>;
    setAgentRuntimeOptions(other, { functions: { ...functions } as BamlFunctionSet });

    expect(getAgentRuntimeOptions(first)?.functions).toBe(functions);
    expect(getAgentRuntimeOptions(other)?.functions).not.toBe(functions);
  });

  it('exposes the symbol only for assertions, never as a string key', () => {
    const agent = initializedAgent();

    expect(typeof AGENT_RUNTIME_CARRIER).toBe('symbol');
    expect(Object.getOwnPropertySymbols(agent)).toContain(AGENT_RUNTIME_CARRIER);
    expect(
      Object.getOwnPropertyDescriptor(agent, AGENT_RUNTIME_CARRIER)?.enumerable,
    ).toBe(false);
  });
});

describe('initializer result union', () => {
  it('narrows a BAML result to its runtime options', () => {
    const result: InitializeResultBase = {
      provider: Providers.BAML,
      llmConfig: { model: 'OpenRouter' },
      runtimeOptions: { functions },
    };

    expect(isBamlInitializeResult(result)).toBe(true);
    expect(isBamlInitializeResult(result) && result.runtimeOptions.functions).toBe(functions);
  });

  it('does not treat an ordinary provider result as BAML', () => {
    const result: InitializeResultBase = {
      provider: Providers.OPENAI,
      llmConfig: { model: 'gpt-4o' } as InitializeResultBase['llmConfig'],
    };

    expect(isBamlInitializeResult(result)).toBe(false);
  });

  it('does not treat a provider-less result as BAML', () => {
    const result: InitializeResultBase = {
      llmConfig: { model: 'gpt-4o' } as InitializeResultBase['llmConfig'],
    };

    expect(isBamlInitializeResult(result)).toBe(false);
  });
});
