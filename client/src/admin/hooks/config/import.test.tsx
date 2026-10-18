import { renderHook } from '@testing-library/react';
import { configSchema } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import type * as t from '~/admin/types';
import { extractSchemaTree, getSchemaPathSet } from '~/admin/api/config';
import { QueryClient, QueryClientProvider } from '~/admin/query';
import { flattenObject } from '~/admin/utils';
import { useImportPreview } from './import';
import '~/locales/i18n';

jest.mock('~/admin/api', () => ({
  baseConfigOptions: { queryKey: ['baseConfig'], queryFn: jest.fn(), staleTime: Infinity },
  createRoleFn: jest.fn(),
  createScopeFn: jest.fn(),
  createGroupFn: jest.fn(),
}));

const tree = extractSchemaTree(configSchema as t.ZodSchemaLike);
const schemaPathSet = getSchemaPathSet();
const moonshot = {
  name: 'Moonshot',
  apiKey: '${KIMI}',
  baseURL: 'https://api.moonshot.ai/v1',
  models: { default: ['kimi-k2.5'], fetch: true },
  titleConvo: true,
  titleModel: 'current_model',
};
/** A librechat.yaml `{ key: useResponsesApi, default: true }` as LibreChat expands it at startup. */
const responsesApi = {
  key: 'useResponsesApi',
  label: 'com_admin_endpoint_use_responses_api',
  labelCode: true,
  type: 'boolean',
  default: true,
  component: 'switch',
  optionType: 'custom',
  columnSpan: 2,
};
const foundry = {
  name: 'Foundry',
  apiKey: '${FOUNDRY}',
  baseURL: 'https://foundry.example.com/v1',
  models: { default: ['gpt-5'] },
  customParams: { defaultParamsEndpoint: 'azureOpenAI', paramDefinitions: [responsesApi] },
};
/** An endpoint whose literal librechat.yaml key LibreChat hides (no value, no preview). */
const local = { name: 'Local', baseURL: 'http://127.0.0.1:11434/v1', models: { default: ['m'] } };
const yamlConfig: t.ConfigRecord = {
  interface: { presets: true },
  endpoints: { custom: [moonshot, foundry, local] },
};
const dbOverrides: t.ConfigRecord = {
  endpoints: { custom: [{ name: 'Moonshot', baseURL: 'https://api.moonshot.cn/v1' }] },
};
const base: t.BaseConfigData = {
  config: {
    interface: { presets: true },
    endpoints: {
      custom: [{ ...moonshot, baseURL: 'https://api.moonshot.cn/v1' }, foundry, local],
    },
  },
  yamlConfig,
  yamlPaths: Object.keys(flattenObject(yamlConfig)),
  dbOverrides,
  dbTombstones: [],
  schemaDefaults: {},
};

function renderPreview(appConfig: t.ConfigRecord) {
  const client = new QueryClient();
  client.setQueryData(['baseConfig'], base);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(
    () =>
      useImportPreview({ schemaTree: tree, schemaPathSet, appConfig, target: { type: 'base' } }),
    { wrapper },
  );
}

describe('useImportPreview', () => {
  it('lists only the keys a partial custom endpoint sets, merged by name (D4)', () => {
    const { result } = renderPreview({
      endpoints: { custom: [{ name: 'Moonshot', modelDisplayLabel: 'Kimi Import' }] },
    });
    const [group] = result.current.groups;
    expect(group.rows).toHaveLength(1);
    const changes = group.rows[0].rows;
    expect(changes.map((row) => row.item.path)).toEqual(['endpoints.custom.0.modelDisplayLabel']);
    expect(changes[0].item).toMatchObject({ kind: 'added', after: 'Kimi Import' });
  });

  it('writes an imported parameter definition over the expanded one, keeping its control', () => {
    const { result } = renderPreview({
      endpoints: {
        custom: [
          {
            name: 'Foundry',
            customParams: {
              defaultParamsEndpoint: 'azureOpenAI',
              paramDefinitions: [{ key: 'useResponsesApi', default: false }],
            },
          },
        ],
      },
    });
    const changes = result.current.groups[0].rows[0].rows;
    expect(changes.map((row) => [row.item.kind, row.item.before, row.item.after])).toEqual([
      ['changed', true, false],
    ]);
    const [entry] = result.current.entriesFor(new Set(['endpoints.custom']));
    const written = (entry.value as t.ConfigRecord[]).find((e) => e.name === 'Foundry');
    expect(written?.customParams).toEqual({
      defaultParamsEndpoint: 'azureOpenAI',
      paramDefinitions: [{ ...responsesApi, default: false }],
    });
  });

  it('lists a snippet identical to librechat.yaml as unchanged and writes nothing for it', () => {
    const { result } = renderPreview({
      endpoints: {
        custom: [
          {
            name: 'Foundry',
            customParams: {
              defaultParamsEndpoint: 'azureOpenAI',
              paramDefinitions: [{ key: 'useResponsesApi', default: true }],
            },
          },
        ],
      },
    });
    const [row] = result.current.groups[0].rows;
    expect(row.rows).toEqual([]);
    expect(row.unchanged).toBe(true);
    expect(result.current.entriesFor(new Set(['endpoints.custom']))).toEqual([]);
  });

  it('leaves out a key librechat.yaml hides, saying why, instead of storing it again', () => {
    const { result } = renderPreview({ endpoints: { custom: [{ ...local, apiKey: 'ollama' }] } });
    expect(result.current.groups[0].rows[0].unchanged).toBe(true);
    expect(result.current.entriesFor(new Set(['endpoints.custom']))).toEqual([]);
    expect(result.current.skipped.map((row) => row.path)).toEqual(['endpoints.custom.0.apiKey']);
  });

  it('labels a value librechat.yaml sets by librechat.yaml, not as a default', () => {
    const { result } = renderPreview({ interface: { presets: false } });
    const [row] = result.current.groups[0].rows;
    expect(row.rows[0].item.revertTarget).toEqual({ value: true, source: 'yaml' });
  });
});
