import { configSchema } from 'librechat-data-provider';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import type * as t from '~/admin/types';
import { ConfigValuesProvider } from '~/admin/contexts/ConfigValuesContext';
import { ConfigErrorsProvider } from '~/admin/contexts/ConfigErrorsContext';
import { extractSchemaTree, getSchemaPathSet } from '~/admin/api/config';
import { flattenObject } from '~/admin/utils';
import { useConfigEdits } from './edits';
import { useFieldState } from './field';

const tree = extractSchemaTree(configSchema as t.ZodSchemaLike);
const saved: t.ConfigRecord = {
  balance: { startBalance: 1000000 },
  endpoints: {
    custom: [
      { name: 'Moonshot', apiKey: '${KIMI}', baseURL: 'https://api.moonshot.ai/v1' },
      { name: 'Zai 2', apiKey: 'user_provided', baseURL: 'https://zai' },
    ],
  },
  mcpServers: { github: { url: 'https://gh', headers: { Authorization: 'x' } } },
};

function renderEdits() {
  return renderHook(() =>
    useConfigEdits({
      isEditingScope: false,
      flatBaseline: flattenObject(saved),
      scopeResolvedValues: null,
      baseActiveConfigValues: saved,
      schemaTree: tree,
      schemaPathSet: getSchemaPathSet(),
    }),
  );
}

describe('useConfigEdits', () => {
  it('clears the unsaved state when a text field is edited back (SV-6)', () => {
    const { result } = renderEdits();
    act(() => result.current.handleFieldChange('balance.startBalance', 5));
    expect(result.current.isDirty).toBe(true);
    act(() => result.current.handleFieldChange('balance.startBalance', 1000000));
    expect(result.current.isDirty).toBe(false);
    expect(result.current.editedValues).toEqual({});
  });

  it('clears it when an entry is edited back, and keeps blank draft rows clean', () => {
    const { result } = renderEdits();
    const moonshot = (saved.endpoints as t.ConfigRecord).custom as t.ConfigRecord[];
    act(() =>
      result.current.handleFieldChange('endpoints.custom.0', {
        ...moonshot[0],
        baseURL: 'https://api.moonshot.cn/v1',
      }),
    );
    expect(result.current.isDirty).toBe(true);
    act(() => result.current.handleFieldChange('endpoints.custom.0', { ...moonshot[0] }));
    expect(result.current.isDirty).toBe(false);
    act(() =>
      result.current.handleFieldChange('mcpServers.github.headers', [
        { key: 'Authorization', value: 'x', valueType: 'string' },
        { key: '', value: '', valueType: 'string' },
      ]),
    );
    expect(result.current.editedValues).toHaveProperty(['mcpServers.github.headers']);
    expect(result.current.isDirty).toBe(false);
  });

  it('records each item origin by the entry it was loaded as', () => {
    const { result } = renderEdits();
    const entries = (saved.endpoints as t.ConfigRecord).custom as t.ConfigRecord[];
    act(() => result.current.handleFieldChange('endpoints.custom', [entries[1]]));
    expect(
      result.current.collectionEdits['endpoints.custom'].origins.map((o) => o?.identity),
    ).toEqual(['Zai 2']);
  });

  it('queues and cancels hides, and a new session drops everything', () => {
    const { result } = renderEdits();
    act(() => result.current.handleHideField('mcpServers.github'));
    expect(result.current.visibilityEdits).toEqual({ 'mcpServers.github': 'hide' });
    expect(result.current.isDirty).toBe(true);
    act(() => result.current.handleUnhideField('mcpServers.github'));
    expect(result.current.visibilityEdits).toEqual({});
    act(() => result.current.handleFieldChange('balance.startBalance', 5));
    act(() => result.current.startNewSession());
    expect(result.current.editedValues).toEqual({});
    expect(result.current.isDirty).toBe(false);
  });
});

describe('ConfigErrorsProvider', () => {
  it('fills FieldState.error for the path', () => {
    const values: t.ConfigValuesData = { configValues: saved, editedValues: {} };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConfigValuesProvider value={values}>
        <ConfigErrorsProvider
          value={{ 'endpoints.custom.0.provider': 'Provider must be "anthropic"' }}
        >
          {children}
        </ConfigErrorsProvider>
      </ConfigValuesProvider>
    );
    const { result } = renderHook(() => useFieldState('endpoints.custom.0.provider'), {
      wrapper,
    });
    expect(result.current.error).toBe('Provider must be "anthropic"');
    const other = renderHook(() => useFieldState('balance.startBalance'), { wrapper });
    expect(other.result.current.error).toBeUndefined();
  });
});
