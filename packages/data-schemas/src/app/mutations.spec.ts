import type { ConfigOverrideState } from './mutations';
import {
  setConfigFields,
  unsetConfigPaths,
  toConfigOverrideState,
  tombstoneConfigPaths,
  replaceConfigOverrides,
  isConfigOverrideStateEmpty,
} from './mutations';
import { isConfigPathError, parseFieldPath } from './paths';

function state(overrides: Record<string, unknown>, tombstones: string[] = []): ConfigOverrideState {
  return { overrides, tombstones };
}

const at = (fieldPath: string): string[] => parseFieldPath(fieldPath);

describe('setConfigFields', () => {
  it('applies writes in order and clears the tombstones they write over', () => {
    const input = state({ a: { x: 1 } }, ['memory', 'memory.agent', 'mcpServers.github', 'a.b']);

    const next = setConfigFields(input, [
      { segments: at('a.b'), value: { c: 1 } },
      { segments: at('a.b.c'), value: 2 },
      { segments: at('memory.agent.provider'), value: 'openAI' },
    ]);

    expect(next.overrides).toEqual({
      a: { x: 1, b: { c: 2 } },
      memory: { agent: { provider: 'openAI' } },
    });
    expect(next.tombstones).toEqual(['memory', 'mcpServers.github']);
    expect(input.overrides).toEqual({ a: { x: 1 } });
  });

  it('writes a record whose keys contain dots at its own path', () => {
    const next = setConfigFields(state({}), [
      {
        segments: ['endpoints', 'azureOpenAI', 'groups'],
        value: [{ models: { 'gpt-4.1': true } }],
      },
    ]);

    expect(next.overrides).toEqual({
      endpoints: { azureOpenAI: { groups: [{ models: { 'gpt-4.1': true } }] } },
    });
  });

  it('refuses a write below a stored scalar', () => {
    let caught: unknown;
    try {
      setConfigFields(state({ interface: { modelSelect: true } }), [
        { segments: at('interface.modelSelect.nested'), value: 1 },
      ]);
    } catch (error) {
      caught = error;
    }

    expect(isConfigPathError(caught)).toBe(true);
  });
});

describe('unsetConfigPaths', () => {
  it('prunes parents a reset leaves empty and keeps siblings', () => {
    expect(
      unsetConfigPaths(state({ balance: { startBalance: 5 } }), [at('balance.startBalance')])
        .overrides,
    ).toEqual({});
    expect(
      unsetConfigPaths(state({ balance: { a: 1, b: 2 } }), [at('balance.a')]).overrides,
    ).toEqual({
      balance: { b: 2 },
    });
    expect(
      unsetConfigPaths(
        state({ endpoints: { anthropic: { models: { x: 1 } }, openAI: { a: 1 } } }),
        [at('endpoints.anthropic.models.x')],
      ).overrides,
    ).toEqual({ endpoints: { openAI: { a: 1 } } });
  });

  it('prunes inside an array element without removing or nulling the element', () => {
    const next = unsetConfigPaths(
      state({ endpoints: { custom: [{ name: 'a', headers: { A: '1' } }] } }),
      [at('endpoints.custom.0.headers.A')],
    );

    expect(next.overrides).toEqual({ endpoints: { custom: [{ name: 'a' }] } });
  });

  it('drops tombstones at or below the path and keeps the rest, even under a pruned parent', () => {
    const next = unsetConfigPaths(
      state({ mcpServers: { foo: { title: 'Foo' } } }, [
        'mcpServers.github',
        'mcpServers.foo.url',
        'mcpServers.foo',
      ]),
      [at('mcpServers.foo')],
    );

    expect(next.overrides).toEqual({});
    expect(next.tombstones).toEqual(['mcpServers.github']);
  });

  it('removes a secret and its preview companion together and prunes once', () => {
    const next = unsetConfigPaths(state({ ocr: { apiKey: 'v3:x', apiKeyPreview: '...abcd' } }), [
      at('ocr.apiKey'),
      at('ocr.apiKeyPreview'),
    ]);

    expect(next.overrides).toEqual({});
  });

  it('prunes an emptied atomic theme, so the base theme is inherited again', () => {
    const next = unsetConfigPaths(state({ interface: { theme: { primary: '#000' } } }), [
      at('interface.theme.primary'),
    ]);

    expect(next.overrides).toEqual({});
  });
});

describe('tombstoneConfigPaths', () => {
  it('removes the subtree, prunes, and records each tombstone once', () => {
    const next = tombstoneConfigPaths(
      state({ mcpServers: { github: { title: 'GH' } }, memory: { agent: { id: 'x' } } }, [
        'memory.agent',
      ]),
      [at('mcpServers.github'), at('memory.agent')],
    );

    expect(next.overrides).toEqual({});
    expect(next.tombstones).toEqual(['memory.agent', 'mcpServers.github']);
  });

  it('refuses a path a tombstone cannot name', () => {
    let caught: unknown;
    try {
      tombstoneConfigPaths(state({}), [['endpoints', 'gpt-4.1']]);
    } catch (error) {
      caught = error;
    }

    expect(isConfigPathError(caught)).toBe(true);
  });
});

describe('replaceConfigOverrides and emptiness', () => {
  it('replaces overrides and keeps tombstones', () => {
    expect(replaceConfigOverrides(state({ a: 1 }, ['x.y']), { b: 2 } as never)).toEqual(
      state({ b: 2 }, ['x.y']),
    );
  });

  it('counts shells-only documents without tombstones as empty', () => {
    expect(isConfigOverrideStateEmpty(state({}))).toBe(true);
    expect(isConfigOverrideStateEmpty(state({ balance: {}, endpoints: { custom: {} } }))).toBe(
      true,
    );
    expect(isConfigOverrideStateEmpty(state({}, ['memory']))).toBe(false);
    expect(isConfigOverrideStateEmpty(state({ balance: { enabled: false } }))).toBe(false);
  });

  it('reads a missing or malformed document as the empty state', () => {
    expect(toConfigOverrideState(null)).toEqual(state({}));
    expect(toConfigOverrideState({ overrides: [], tombstones: ['a', 3] })).toEqual(
      state({}, ['a']),
    );
  });
});
