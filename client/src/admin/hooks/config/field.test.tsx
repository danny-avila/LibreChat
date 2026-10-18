import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import type * as t from '~/admin/types';
import {
  baseConfigFixture,
  baseLayersFixture,
  scopeConfigFixture,
  scopeLayersFixture,
  valuesDataFixture,
} from '~/admin/test/layers';
import {
  useFieldState,
  useEntryMarkers,
  useLowerEntryKeys,
  useRecordEntryOverrides,
} from './field';
import { ConfigValuesProvider } from '~/admin/contexts/ConfigValuesContext';
import { useOptionSources } from './options';

const values: t.ConfigValuesData = {
  configValues: { interface: { parameters: true } },
  editedValues: { 'interface.parameters': false },
  configuredPaths: new Set(['interface.parameters']),
  overridePaths: new Set(),
  pendingResets: new Set(),
};

describe('useFieldState', () => {
  it('derives the field state from the nearest provider', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConfigValuesProvider value={values}>{children}</ConfigValuesProvider>
    );
    const { result } = renderHook(() => useFieldState('interface.parameters'), { wrapper });
    expect(result.current).toMatchObject({
      value: false,
      effective: true,
      source: 'yaml',
      isConfigured: true,
      isEdited: true,
    });
  });

  it('returns the empty default state without a provider', () => {
    const { result } = renderHook(() => useFieldState('interface.parameters'));
    expect(result.current).toMatchObject({ value: undefined, source: 'default', isEdited: false });
  });
});

describe('useOptionSources', () => {
  it('returns no options until WS9 implements the sources', () => {
    const { result } = renderHook(() => useOptionSources('endpoints'));
    expect(result.current).toEqual({ options: [], isLoading: false });
  });
});

describe('useLowerEntryKeys', () => {
  const withLayers =
    (layers: t.ValueLayers) =>
    ({ children }: { children: ReactNode }) => (
      <ConfigValuesProvider value={valuesDataFixture(layers)}>{children}</ConfigValuesProvider>
    );

  it('lists the entries librechat.yaml defines in Base, and what Base gives in a profile', () => {
    const base = renderHook(() => useLowerEntryKeys('endpoints.custom', 'name'), {
      wrapper: withLayers(baseLayersFixture()),
    });
    expect([...base.result.current]).toEqual(['GPT', 'Claude']);
    const scope = renderHook(() => useLowerEntryKeys('endpoints.custom', 'name'), {
      wrapper: withLayers(scopeLayersFixture()),
    });
    expect(scope.result.current.has('GPT')).toBe(true);
  });

  it('lists the keys of a record the layer beneath defines (MCP servers)', () => {
    const scope = renderHook(() => useLowerEntryKeys('mcpServers'), {
      wrapper: withLayers(scopeLayersFixture()),
    });
    expect([...scope.result.current]).toEqual(['github', 'docs']);
  });

  it('is empty outside a provider with the layer model', () => {
    const { result } = renderHook(() => useLowerEntryKeys('endpoints.custom', 'name'));
    expect(result.current.size).toBe(0);
  });
});

describe('entry header markers', () => {
  const withLayers =
    (layers: t.ValueLayers) =>
    ({ children }: { children: ReactNode }) => (
      <ConfigValuesProvider value={valuesDataFixture(layers)}>{children}</ConfigValuesProvider>
    );
  const base = baseLayersFixture(
    baseConfigFixture({
      dbOverrides: {
        endpoints: {
          custom: [
            { name: 'Claude', iconURL: 'https://c.example/i.png' },
            { name: 'Panel', baseURL: 'https://panel.example' },
          ],
        },
        mcpServers: { github: { title: 'GitHub' }, mine: { url: 'https://mine' }, docs: {} },
      },
    }),
  );

  it('marks an entry the panel changes as an override, and one it adds as added', () => {
    const { result } = renderHook(() => useEntryMarkers('endpoints.custom'), {
      wrapper: withLayers(base),
    });
    const markersOf = result.current;
    expect(markersOf?.({ name: 'Claude', iconURL: 'https://c.example/i.png' })).toMatchObject({
      overridden: true,
      added: false,
    });
    expect(markersOf?.({ name: 'Panel', baseURL: 'https://panel.example' })).toMatchObject({
      overridden: true,
      added: true,
    });
    expect(markersOf?.({ name: 'GPT', baseURL: 'https://gpt.example.com' })).toMatchObject({
      overridden: false,
      added: false,
    });
  });

  it('marks MCP servers the edit target stores something in, not the empty objects resets leave', () => {
    const { result } = renderHook(() => useRecordEntryOverrides('mcpServers'), {
      wrapper: withLayers(base),
    });
    expect(result.current?.('github')).toEqual({ overridden: true, added: false });
    expect(result.current?.('mine')).toEqual({ overridden: true, added: true });
    expect(result.current?.('docs')).toEqual({ overridden: false, added: false });
  });

  it("reads a profile's own overrides over Base in a profile", () => {
    const scope = scopeLayersFixture(
      scopeConfigFixture({ overrides: { mcpServers: { github: { title: 'Mine' } } } }),
    );
    const { result } = renderHook(() => useRecordEntryOverrides('mcpServers'), {
      wrapper: withLayers(scope),
    });
    expect(result.current?.('github')).toEqual({ overridden: true, added: false });
    expect(result.current?.('docs')).toEqual({ overridden: false, added: false });
  });
});
