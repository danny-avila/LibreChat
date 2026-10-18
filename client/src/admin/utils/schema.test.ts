import { configSchema } from 'librechat-data-provider';
import { collectSchemaPaths, getUnknownConfigKeys } from './schema';
import { extractSchemaTree } from '~/admin/api/config/schema';
import { createField } from '~/admin/test/fixtures';

describe('getUnknownConfigKeys', () => {
  const tree = [
    createField({
      key: 'interface',
      path: 'interface',
      type: 'object',
      isObject: true,
      children: [createField({ key: 'title', path: 'interface.title' })],
    }),
    createField({
      key: 'servers',
      path: 'servers',
      type: 'record',
      recordValueType: 'complex',
      children: [
        createField({ key: 'url', path: 'servers.{}.url' }),
        createField({ key: 'apiKey', path: 'servers.{}.apiKey' }),
        createField({ key: 'headers', path: 'servers.{}.headers', type: 'record' }),
      ],
    }),
    createField({
      key: 'list',
      path: 'list',
      type: 'array<object>',
      isArray: true,
      children: [createField({ key: 'name', path: 'list.[].name' })],
    }),
  ];
  const paths = collectSchemaPaths(tree);

  it('reports unknown keys at every depth with their data paths', () => {
    const config = {
      interface: { title: 'x', replyNotifications: { enabled: true } },
      servers: { github: { url: 'u', sandbox: true, headers: { 'X-Any': 'ok' } } },
      list: [{ name: 'a' }, { name: 'b', pinned: true }],
      projects: { enabled: true },
    };
    expect(getUnknownConfigKeys(config, paths)).toEqual([
      'interface.replyNotifications',
      'servers.github.sandbox',
      'list.1.pinned',
      'projects',
    ]);
  });

  it('skips secret preview companions and undefined values', () => {
    const config = { servers: { a: { apiKey: '', apiKeyPreview: 'sk-…1234', url: undefined } } };
    expect(getUnknownConfigKeys(config, paths)).toEqual([]);
  });

  it('finds nothing unknown in a config the real schema describes', () => {
    const real = collectSchemaPaths(extractSchemaTree(configSchema));
    const config = {
      version: '1.3.0',
      balance: { enabled: true, startBalance: 1000 },
      mcpServers: { github: { type: 'streamable-http', url: 'https://x', chatMenu: false } },
      modelSpecs: { list: [{ name: 'a', label: 'A', preset: { endpoint: 'openAI' } }] },
      endpoints: { custom: [{ name: 'Groq', models: { default: ['m'] } }] },
    };
    expect(getUnknownConfigKeys(config, real)).toEqual([]);
    expect(getUnknownConfigKeys({ ...config, notASection: {} }, real)).toEqual(['notASection']);
  });
});
