import { configSchema } from 'librechat-data-provider';
import type * as t from '~/admin/types';
import { collectImportEntries, planImport } from './import';
import { extractSchemaTree } from '~/admin/api/config';
import { collectFieldPaths } from './counts';

const tree = extractSchemaTree(configSchema as t.ZodSchemaLike);
const paths = new Set(collectFieldPaths(tree));

describe('planImport', () => {
  it('writes exactly the snippet leaves and says why the others are left out', () => {
    const plan = planImport(
      {
        version: '1.3.3',
        balance: { startBalance: 777 },
        interface: { prompts: false, customWelcome: 'Hi' },
        filters: { messages: { pii: { action: 'mask' } } },
        brandNew: { flag: true },
      },
      tree,
      paths,
    );
    expect(plan.entries).toEqual([
      { fieldPath: 'balance.startBalance', value: 777 },
      { fieldPath: 'interface.customWelcome', value: 'Hi' },
      { fieldPath: 'brandNew.flag', value: true },
    ]);
    expect(plan.skipped).toEqual([
      { fieldPath: 'interface.prompts', reason: 'permission' },
      { fieldPath: 'filters.messages.pii.action', reason: 'baseOnly' },
    ]);
    expect([...plan.unknown]).toEqual(['brandNew.flag']);
  });

  it('leaves out sections a profile cannot set when importing into one', () => {
    const config = {
      registration: { allowedDomains: ['evil.com'] },
      interface: { presets: false },
    };
    expect(planImport(config, tree, paths).entries).toHaveLength(2);
    const plan = planImport(config, tree, paths, true);
    expect(plan.entries).toEqual([{ fieldPath: 'interface.presets', value: false }]);
    expect(plan.skipped).toEqual([
      { fieldPath: 'registration.allowedDomains', reason: 'baseScope' },
    ]);
  });

  it('does not block on dotted keys inside sections that are skipped anyway', () => {
    const plan = planImport(
      {
        balance: { startBalance: 5 },
        endpoints: {
          azureOpenAI: {
            groups: [{ group: 'eastus', apiKey: 'k', models: { 'gpt-4.1': true } }],
          },
          bedrock: { inferenceProfiles: { 'us.anthropic.claude': 'arn:x', plain: 'arn:y' } },
        },
      },
      tree,
      paths,
    );
    expect(plan.entries).toEqual([
      { fieldPath: 'balance.startBalance', value: 5 },
      { fieldPath: 'endpoints.bedrock.inferenceProfiles.plain', value: 'arn:y' },
    ]);
    expect(plan.skipped).toEqual([
      { fieldPath: 'endpoints.azureOpenAI.groups', reason: 'yamlOnly' },
      {
        fieldPath: 'endpoints.bedrock.inferenceProfiles',
        reason: 'unsafeKey',
        key: 'us.anthropic.claude',
      },
    ]);
  });

  it('leaves out process-backed MCP servers once, and imports remote ones', () => {
    const plan = planImport(
      {
        mcpServers: {
          local: { command: 'npx', args: ['-y', 'server'], env: { 'A.B': '1' } },
          remote: { type: 'streamable-http', url: 'https://mcp.example' },
        },
      },
      tree,
      paths,
    );
    expect(plan.entries.map((e) => e.fieldPath)).toEqual([
      'mcpServers.remote.type',
      'mcpServers.remote.url',
    ]);
    expect(plan.skipped).toEqual([{ fieldPath: 'mcpServers.local', reason: 'processMcp' }]);
  });

  it('maps AppService aliases instead of reporting them unknown', () => {
    const plan = planImport({ interfaceConfig: { customWelcome: 'hi' } }, tree, paths);
    expect(plan.entries).toEqual([{ fieldPath: 'interface.customWelcome', value: 'hi' }]);
    expect(plan.unknown.size).toBe(0);
  });
});

describe('collectImportEntries', () => {
  it('never splits a dotted key into a nested path', () => {
    const { entries, skipped } = collectImportEntries(
      { endpoints: { bedrock: { inferenceProfiles: { 'us.a.b': 'arn' } } } },
      tree,
      paths,
    );
    expect(entries).toEqual([]);
    expect(skipped).toEqual([
      { fieldPath: 'endpoints.bedrock.inferenceProfiles', reason: 'unsafeKey', key: 'us.a.b' },
    ]);
  });
});
