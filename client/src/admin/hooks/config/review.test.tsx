import { configSchema } from 'librechat-data-provider';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import type * as t from '~/admin/types';
import { extractSchemaTree, getSchemaPathSet } from '~/admin/api/config';
import { QueryClient, QueryClientProvider } from '~/admin/query';
import { flattenObject } from '~/admin/utils';
import { useChangeReview } from './review';
import { useConfigEdits } from './edits';
import { useConfigSave } from './save';
import '~/locales/i18n';

jest.mock('~/admin/api', () => ({ applyConfigChangesFn: jest.fn(), resetBaseConfigFn: jest.fn() }));

const tree = extractSchemaTree(configSchema as t.ZodSchemaLike);
const schemaPathSet = getSchemaPathSet();
const models = { default: ['kimi-k2.5'] };
const moonshot = {
  name: 'Moonshot',
  apiKey: '${KIMI}',
  baseURL: 'https://api.moonshot.ai/v1',
  models,
};
const zai = { name: 'Zai 2', apiKey: 'user_provided', baseURL: 'https://zai', models };
const yaml: t.ConfigRecord = {
  balance: { startBalance: 1000000 },
  endpoints: { custom: [moonshot, zai] },
};

/** The page's edit, save and review hooks over a base config that is librechat.yaml alone. */
function renderPage(config: t.ConfigRecord = yaml) {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(
    () => {
      const edits = useConfigEdits({
        isEditingScope: false,
        flatBaseline: flattenObject(config),
        scopeResolvedValues: null,
        baseActiveConfigValues: config,
        schemaTree: tree,
        schemaPathSet,
      });
      const layers = {
        configValues: config,
        dbOverrides: {},
        yamlConfig: config,
        yamlMcpServers: {},
        schemaDefaults: {},
        schemaPathSet,
        overridePaths: new Set<string>(),
        valueLayers: null,
        baseActiveConfigValues: config,
      };
      const save = useConfigSave({ schemaTree: tree, schemaPathSet, layers, edits });
      const review = useChangeReview({
        schemaTree: tree,
        layers,
        edits,
        save,
        onTabChange: () => undefined,
      });
      return { edits, save, review };
    },
    { wrapper },
  );
}

describe('the change review over the save pipeline (WS1 × WS7)', () => {
  it('shows one entry field change, although the write is a per-entry op', () => {
    const { result } = renderPage();
    act(() =>
      result.current.edits.handleFieldChange('endpoints.custom.0', {
        ...moonshot,
        baseURL: 'https://api.moonshot.cn/v1',
      }),
    );
    const { review } = result.current;
    expect(review.model.count).toBe(1);
    expect(review.blocked).toBe(false);
    const rows = review.model.tabs.flatMap((tab) =>
      tab.sections.flatMap((section) => [
        ...section.rows,
        ...section.entries.flatMap((entry) => entry.rows),
      ]),
    );
    expect(rows.map((row) => row.item.path)).toEqual(['endpoints.custom.0.baseURL']);
    expect(rows[0].item).toMatchObject({
      before: 'https://api.moonshot.ai/v1',
      after: 'https://api.moonshot.cn/v1',
    });
  });

  it('warns that a value Global (all providers) takes precedence over has no effect (D11)', () => {
    const { result } = renderPage({
      ...yaml,
      endpoints: { ...(yaml.endpoints as t.ConfigRecord), all: { activityModel: 'gpt-luna' } },
    });
    act(() => result.current.edits.handleFieldChange('endpoints.openAI.activityModel', 'gpt-x'));
    const rows = result.current.review.model.tabs.flatMap((tab) =>
      tab.sections.flatMap((section) => section.rows),
    );
    expect(rows.map((row) => [row.item.path, row.item.warnings])).toEqual([
      ['endpoints.openAI.activityModel', ['shadowed']],
    ]);
  });

  it('says a provider title setting is ignored while Global exists, even where Global leaves it unset (D11)', () => {
    const { result } = renderPage({
      ...yaml,
      endpoints: { ...(yaml.endpoints as t.ConfigRecord), all: { activityModel: 'gpt-luna' } },
    });
    act(() => result.current.edits.handleFieldChange('endpoints.openAI.titleModel', 'gpt-x'));
    const rows = result.current.review.model.tabs.flatMap((tab) =>
      tab.sections.flatMap((section) => section.rows),
    );
    expect(rows.map((row) => [row.item.path, row.item.warnings])).toEqual([
      ['endpoints.openAI.titleModel', ['shadowedBlock']],
    ]);
  });

  it("blocks Save on the pipeline's issue when a librechat.yaml entry is removed (D1)", () => {
    const { result } = renderPage();
    act(() => result.current.edits.handleFieldChange('endpoints.custom', [moonshot]));
    const { review } = result.current;
    expect(review.blocked).toBe(true);
    expect(review.model.issues.map((issue) => issue.message).join(' ')).toMatch(/Zai 2/);
  });
});
