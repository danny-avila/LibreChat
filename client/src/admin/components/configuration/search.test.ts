import { configSchema } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import type * as t from '~/admin/types';
import { buildConfigSearchIndex, searchConfigIndex, formatSearchValue, tokenize } from './search';
import { extractSchemaTree } from '~/admin/api/config';
import { createField } from '~/admin/test/fixtures';
import { findSchemaField } from './controls';
import i18n from '~/locales/i18n';

const localize: t.LocalizeFn = (key, options) =>
  String(i18n.t(key as TranslationKeys, options ?? {}));
const tree = extractSchemaTree(configSchema as t.ZodSchemaLike);

const values: Record<string, t.ConfigValue> = {
  balance: { enabled: true, startBalance: 1_000_000 },
  endpoints: {
    openAI: { titleModel: 'gpt-5-mini' },
    custom: [
      { name: 'ClickHouse', baseURL: 'https://ch.example/v1', apiKey: 'sk-live-secret' },
      { name: 'Moonshot', baseURL: 'https://api.moonshot.ai/v1', apiKey: '${MOONSHOT_KEY}' },
    ],
  },
  mcpServers: {
    github: { url: 'https://api.githubcopilot.com/mcp/' },
    everything: { command: 'npx', args: ['-y', 'server-everything'] },
  },
  modelSpecs: { list: [{ name: 'gpt-research', label: 'Deep research' }] },
};

const index = buildConfigSearchIndex(tree, values, localize);
const top = (query: string) => searchConfigIndex(index, query, 5).map((hit) => hit.item);

describe('tokenize', () => {
  it('splits camelCase, acronyms, dots and punctuation', () => {
    expect(tokenize('startBalance')).toEqual(['startbalance', 'start', 'balance']);
    expect(tokenize('endpoints.custom.0.baseURL')).toEqual([
      'endpoints',
      'custom',
      '0',
      'baseurl',
      'base',
      'url',
    ]);
    expect(tokenize('MCP servers')).toEqual(['mcp', 'servers']);
    expect(tokenize('OpenAI')).toEqual(['openai', 'open', 'ai']);
  });
});

describe('buildConfigSearchIndex', () => {
  it('indexes nested schema leaves with their tab and breadcrumb', () => {
    const item = index.find((entry) => entry.path === 'rateLimits.fileUploads.ipMax');
    expect(item).toMatchObject({ tab: 'system', sectionId: 'rateLimits', kind: 'field' });
    expect(item?.breadcrumb).toEqual(['System', 'Rate limits', 'File uploads']);
  });

  it('indexes dynamic entries and their fields from the values', () => {
    expect(index.find((e) => e.path === 'endpoints.custom.1')).toMatchObject({
      label: 'Moonshot',
      kind: 'entry',
      tab: 'custom',
      sectionId: 'endpoints',
    });
    expect(index.find((e) => e.path === 'mcpServers.github')).toMatchObject({
      label: 'github',
      tab: 'mcp',
    });
    expect(index.find((e) => e.path === 'modelSpecs.list.0')).toMatchObject({
      label: 'gpt-research',
      tab: 'specs',
    });
    const baseUrl = index.find((e) => e.path === 'endpoints.custom.1.baseURL');
    expect(baseUrl?.breadcrumb).toContain('Moonshot');
    expect(baseUrl?.value).toBe('https://api.moonshot.ai/v1');
  });

  it('splits endpoints between the providers and custom endpoints tabs', () => {
    expect(index.find((e) => e.path === 'endpoints.openAI.titleModel')).toMatchObject({
      tab: 'providers',
      sectionId: 'endpointsProviders',
    });
    expect(index.some((e) => e.tab === 'providers' && e.path.startsWith('endpoints.custom'))).toBe(
      false,
    );
    expect(index.some((e) => e.tab === 'custom' && e.path.startsWith('endpoints.openAI'))).toBe(
      false,
    );
  });

  it('never exposes secret values, but shows environment references and formats numbers', () => {
    const apiKey = index.find((e) => e.path === 'endpoints.custom.0.apiKey');
    expect(apiKey?.value).toBe('••••••••');
    expect(JSON.stringify(index)).not.toContain('sk-live-secret');
    expect(index.find((e) => e.path === 'endpoints.custom.1.apiKey')?.value).toBe(
      '${MOONSHOT_KEY}',
    );
    expect(index.find((e) => e.path === 'balance.startBalance')?.value).toBe(
      `${(1_000_000).toLocaleString()} credits`,
    );
  });

  it("indexes only the fields of an MCP server's transport", () => {
    const paths = new Set(index.map((e) => e.path));
    expect(paths.has('mcpServers.github.url')).toBe(true);
    expect(paths.has('mcpServers.github.command')).toBe(false);
    expect(paths.has('mcpServers.github.args')).toBe(false);
    expect(paths.has('mcpServers.everything.command')).toBe(true);
    expect(paths.has('mcpServers.everything.url')).toBe(false);
  });

  it('skips hidden sections', () => {
    expect(index.some((e) => e.path === 'version' || e.path.startsWith('cache'))).toBe(false);
  });
});

describe('searchConfigIndex', () => {
  it('finds a nested field by its label words, in any case and order', () => {
    expect(top('start balance')[0]).toMatchObject({ path: 'balance.startBalance' });
    expect(top('Balance start')[0]).toMatchObject({ path: 'balance.startBalance' });
    expect(top('startBalance')[0]).toMatchObject({ path: 'balance.startBalance' });
  });

  it('matches by word prefix, not by scattered letters', () => {
    expect(top('refill am')[0]).toMatchObject({ path: 'balance.refillAmount' });
    expect(top('rfl')).toEqual([]);
  });

  it('ranks the entry itself above its fields', () => {
    expect(top('Moonshot')[0]).toMatchObject({ path: 'endpoints.custom.1', kind: 'entry' });
  });

  it('uses the breadcrumb to narrow to one entry', () => {
    expect(top('moonshot base url')[0]).toMatchObject({ path: 'endpoints.custom.1.baseURL' });
  });

  it('finds provider and MCP fields', () => {
    expect(top('title model').map((item) => item.path)).toContain('endpoints.openAI.titleModel');
    expect(top('openai title model')[0]).toMatchObject({ path: 'endpoints.openAI.titleModel' });
    expect(top('github')[0]).toMatchObject({ path: 'mcpServers.github' });
  });

  it('ranks matches on the open tab first', () => {
    const onCustom = searchConfigIndex(index, 'title model', 1, 'custom')[0].item;
    expect(onCustom.tab).toBe('custom');
    const onProviders = searchConfigIndex(index, 'title model', 1, 'providers')[0].item;
    expect(onProviders.tab).toBe('providers');
  });

  it('ranks settings that apply everywhere above the same field of each entry', () => {
    const [first] = top('title');
    expect(first.path.startsWith('mcpServers.')).toBe(false);
    expect(first.path).not.toMatch(/\.\d+\./);
  });

  it('returns nothing for an empty query', () => {
    expect(searchConfigIndex(index, '   ')).toEqual([]);
  });
});

describe('formatSearchValue', () => {
  it('formats booleans, lists and long strings', () => {
    expect(formatSearchValue(true, 'enabled', localize)).toBe('On');
    expect(formatSearchValue(['a', 'b'], 'domains', localize)).toBe('2 items');
    expect(formatSearchValue('x'.repeat(60), 'description', localize)?.length).toBe(40);
    expect(formatSearchValue(undefined, 'x', localize)).toBeUndefined();
    expect(formatSearchValue({ a: 1 }, 'x', localize)).toBeUndefined();
  });
});

describe('formatSearchValue with its field', () => {
  const localize = (key: string, vars?: Record<string, string | number>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key;

  it('uses option labels and units instead of raw values', () => {
    const unit = findSchemaField(tree, 'balance.refillIntervalUnit');
    if (!unit) throw new Error('no refillIntervalUnit field');
    expect(formatSearchValue('hours', 'refillIntervalUnit', localize, unit)).toBe('Hours');
    const start = createField({
      key: 'startBalance',
      path: 'balance.startBalance',
      type: 'number',
    });
    expect(formatSearchValue(1000000, 'startBalance', localize, start)).toContain('credits');
  });

  it('still masks secrets', () => {
    const key = createField({ key: 'apiKey', path: 'endpoints.custom.[].apiKey' });
    expect(formatSearchValue('sk-live-123456', 'apiKey', localize, key)).not.toContain('sk-live');
  });
});
