import { configSchema } from 'librechat-data-provider';
import type * as t from '~/admin/types';
import {
  isCountLeaf,
  countEntries,
  countSection,
  hasDescendant,
  hasPathOverlap,
  countConfigured,
  isPathConfigured,
  overrideCountUnit,
  countSectionOverrides,
  countEntrySectionOverrides,
} from './counts';
import { filterInterfacePermissionChildren } from '~/admin/utils';
import { extractSchemaTree } from '~/admin/api/config';

/** The schema tree the page renders (interface permission fields removed). */
function realSchemaTree(): t.SchemaField[] {
  const tree = extractSchemaTree(configSchema as t.ZodSchemaLike);
  for (const section of tree) {
    if (section.key === 'interface' && section.children) {
      section.children = filterInterfacePermissionChildren(section.children);
    }
  }
  return tree;
}

const tree = realSchemaTree();

function section(key: string): t.SchemaField {
  const found = tree.find((s) => s.key === key);
  if (!found) throw new Error(`no ${key} section`);
  return found;
}

function child(field: t.SchemaField, key: string): t.SchemaField {
  const found = field.children?.find((c) => c.key === key);
  if (!found) throw new Error(`no ${key} under ${field.key}`);
  return found;
}

describe('isCountLeaf on the real schema', () => {
  it('treats lists, records and boolean|object switches as one setting', () => {
    expect(isCountLeaf(child(section('modelSpecs'), 'list'))).toBe(true);
    expect(isCountLeaf(child(section('fileConfig'), 'endpoints'))).toBe(true);
    expect(isCountLeaf(child(section('interface'), 'schedules'))).toBe(true);
    expect(isCountLeaf(child(child(section('endpoints'), 'azureOpenAI'), 'groups'))).toBe(true);
    expect(isCountLeaf(child(section('endpoints'), 'agents'))).toBe(false);
  });
});

describe('countConfigured on the real schema', () => {
  it('counts a configured list as one setting (modelSpecs.list)', () => {
    const specs = section('modelSpecs');
    const counts = countConfigured(
      specs.children ?? [],
      'modelSpecs',
      new Set(['modelSpecs.list']),
    );
    expect(counts.configured).toBe(1);
    expect(counts.total).toBe(specs.children?.length);
  });

  it('counts a boolean set on a boolean|object switch (interface.schedules: true)', () => {
    const counts = countConfigured(
      section('interface').children ?? [],
      'interface',
      new Set(['interface.schedules', 'interface.parameters']),
    );
    expect(counts.configured).toBe(2);
  });

  it('counts each stored value of a switch or record when counting overrides', () => {
    const overrides = new Set([
      'interface.schedules.maxPerUser',
      'interface.schedules.minIntervalMinutes',
      'interface.parameters',
    ]);
    const fields = section('interface').children ?? [];
    expect(countConfigured(fields, 'interface', overrides).configured).toBe(2);
    expect(countConfigured(fields, 'interface', overrides, true).configured).toBe(3);
    expect(
      countConfigured(
        section('fileConfig').children ?? [],
        'fileConfig',
        new Set([
          'fileConfig.endpoints.agents.fileSizeLimit',
          'fileConfig.endpoints.agents.totalSizeLimit',
        ]),
        true,
      ).configured,
    ).toBe(2);
    expect(countSectionOverrides({ id: 'interface', fields }, overrides)).toBe(3);
  });

  it('counts record entries under their record (fileConfig.endpoints.agents.*)', () => {
    const counts = countConfigured(
      section('fileConfig').children ?? [],
      'fileConfig',
      new Set(['fileConfig.endpoints.agents.fileSizeLimit']),
    );
    expect(counts.configured).toBe(1);
  });

  it('counts only what librechat.yaml sets for Agents and nothing for synthesized Azure Assistants', () => {
    const endpoints = section('endpoints');
    const configured = new Set([
      'endpoints.agents.disableBuilder',
      'endpoints.agents.recursionLimit',
      'endpoints.agents.capabilities',
    ]);
    const agents = child(endpoints, 'agents');
    expect(countConfigured(agents.children ?? [], 'endpoints.agents', configured).configured).toBe(
      3,
    );
    const azureAssistants = child(endpoints, 'azureAssistants');
    expect(
      countConfigured(azureAssistants.children ?? [], 'endpoints.azureAssistants', configured)
        .configured,
    ).toBe(0);
  });

  it('counts an array-of-object field once (endpoints.azureOpenAI.groups)', () => {
    const azure = child(section('endpoints'), 'azureOpenAI');
    const counts = countConfigured(
      azure.children ?? [],
      'endpoints.azureOpenAI',
      new Set(['endpoints.azureOpenAI.groups', 'endpoints.azureOpenAI.titleModel']),
    );
    expect(counts.configured).toBe(2);
  });

  it('counts a group set to a primitive as one configured setting', () => {
    const fields: t.SchemaField[] = [
      {
        path: 'x.group',
        key: 'group',
        type: 'object',
        isOptional: true,
        isNullable: false,
        isArray: false,
        isObject: true,
        depth: 1,
        children: [
          {
            path: 'x.group.a',
            key: 'a',
            type: 'string',
            isOptional: true,
            isNullable: false,
            isArray: false,
            isObject: false,
            depth: 2,
          },
        ],
      },
    ];
    expect(countConfigured(fields, 'x', new Set(['x.group']))).toEqual({ total: 1, configured: 1 });
    expect(countConfigured(fields, 'x', new Set())).toEqual({ total: 1, configured: 0 });
    expect(countConfigured(fields[0].children ?? [], 'x.group', new Set(['x.group']))).toEqual({
      total: 1,
      configured: 1,
    });
  });
});

describe('countSection', () => {
  it('counts entries for MCP servers and fields for other sections', () => {
    const mcp = section('mcpServers');
    expect(
      countSection({ id: 'mcpServers', fields: mcp.children ?? [] }, new Set(), {
        mcpServers: { a: {}, b: {} },
      }),
    ).toEqual({ total: 2, configured: 2, entries: true });
    const specs = section('modelSpecs');
    expect(
      countSection(
        { id: 'modelSpecs', fields: specs.children ?? [] },
        new Set(['modelSpecs.list']),
        null,
      ).configured,
    ).toBe(1);
  });

  it('counts a single-field section as one setting', () => {
    expect(
      countSection(
        { id: 'imageOutputType', fields: [], sectionField: section('imageOutputType') },
        new Set(['imageOutputType']),
        null,
      ),
    ).toEqual({ total: 1, configured: 1 });
  });
});

describe('path helpers', () => {
  it('finds descendants with a cached index that follows set changes', () => {
    const paths = new Set(['balance.startBalance']);
    expect(hasDescendant('balance', paths)).toBe(true);
    expect(hasDescendant('bal', paths)).toBe(false);
    paths.add('mcpServers.github.url');
    expect(hasDescendant('mcpServers.github', paths)).toBe(true);
    expect(isPathConfigured('balance.startBalance', paths)).toBe(true);
    expect(isPathConfigured('balance.enabled', paths)).toBe(false);
  });

  it('detects overlap with descendants and ancestors', () => {
    const paths = new Set(['endpoints.custom', 'balance.startBalance']);
    expect(hasPathOverlap('endpoints.custom.3.name', paths)).toBe(true);
    expect(hasPathOverlap('balance', paths)).toBe(true);
    expect(hasPathOverlap('endpoints.customX', paths)).toBe(false);
  });

  it('counts list and record entries', () => {
    expect(countEntries([1, 2, 3])).toBe(3);
    expect(countEntries({ a: 1 })).toBe(1);
    expect(countEntries(undefined)).toBe(0);
  });
});

describe('override units', () => {
  it('counts an MCP server once however many of its fields are set', () => {
    expect(overrideCountUnit('mcpServers.github.url')).toBe('mcpServers.github');
    expect(overrideCountUnit('mcpServers.github')).toBe('mcpServers.github');
    expect(overrideCountUnit('interface.schedules.maxPerUser')).toBe(
      'interface.schedules.maxPerUser',
    );
  });

  it('counts collection sections by entry and leaves other sections to the setting count', () => {
    const custom = child(section('endpoints'), 'custom');
    const counts = new Map([['endpoints.custom', 2]]);
    expect(
      countEntrySectionOverrides({ id: 'endpoints', fields: [custom] }, new Set(), counts),
    ).toBe(2);
    expect(
      countEntrySectionOverrides(
        { id: 'mcpServers', fields: [] },
        new Set(['mcpServers.a.url', 'mcpServers.a.type', 'mcpServers.b.url']),
      ),
    ).toBe(2);
    expect(
      countEntrySectionOverrides(
        { id: 'interface', fields: section('interface').children ?? [] },
        new Set(['interface.parameters']),
      ),
    ).toBeUndefined();
  });
});
