import type * as t from '~/admin/types';
import { buildTocEntries, entryHasPath, findTocEntry, toJumpTargets } from './toc';
import { createPathIndex } from '~/admin/utils';

const localize: t.LocalizeFn = (key) =>
  key.replace('com_admin_config_field_', '').replace('com_admin_config_section_', '');

const field = (key: string, extra: Partial<t.SchemaField> = {}): t.SchemaField => ({
  path: key,
  key,
  type: 'string',
  isOptional: true,
  isNullable: false,
  isArray: false,
  isObject: false,
  depth: 1,
  ...extra,
});

const sections: t.ConfigSectionConfig[] = [
  {
    id: 'rateLimits',
    titleKey: 'com_admin_config_section_rateLimits',
    fields: [
      field('fileUploads', { isObject: true, type: 'object', children: [field('ipMax')] }),
      field('headers', { type: 'record', recordValueType: 'primitive' }),
      field('enabled', { type: 'boolean' }),
    ],
  },
  {
    id: 'endpoints',
    titleKey: 'com_admin_config_tab_custom_endpoints',
    fields: [],
    tocItems: [
      {
        id: 'section-endpoints-custom-0',
        label: 'Moonshot',
        dataPath: 'endpoints.custom.0',
        path: 'endpoints.custom.0',
      },
    ],
  },
];

describe('buildTocEntries', () => {
  const entries = buildTocEntries(sections, localize);

  it('lists nested groups (not plain fields or primitive records) under schema sections', () => {
    expect(entries[0]).toMatchObject({ id: 'section-rateLimits', path: 'rateLimits' });
    expect(entries[0].children.map((c) => c.id)).toEqual(['section-rateLimits.fileUploads']);
  });

  it('uses collection items with their reveal paths', () => {
    expect(entries[1].children[0]).toMatchObject({
      label: 'Moonshot',
      path: 'endpoints.custom.0',
      dataPath: 'endpoints.custom.0',
      sectionId: 'endpoints',
    });
  });

  it('lists only the children holding a match of the tab filter', () => {
    const filtered = buildTocEntries(sections, localize, createPathIndex(['rateLimits.enabled']));
    expect(filtered[0].children).toEqual([]);
    const matched = buildTocEntries(sections, localize, createPathIndex(['endpoints.custom.0.x']));
    expect(matched[1].children.map((c) => c.label)).toEqual(['Moonshot']);
  });

  it('finds entries by id and flattens them for Jump to', () => {
    expect(findTocEntry(entries, 'section-endpoints-custom-0')?.label).toBe('Moonshot');
    expect(toJumpTargets(entries)).toEqual([
      { id: 'section-rateLimits', label: 'rateLimits' },
      { id: 'section-rateLimits.fileUploads', label: 'fileUploads', child: true },
      { id: 'section-endpoints', label: 'com_admin_config_tab_custom_endpoints' },
      { id: 'section-endpoints-custom-0', label: 'Moonshot', child: true },
    ]);
  });

  it('matches dirty or configured paths to sections and entries', () => {
    const [rate, custom] = entries;
    expect(entryHasPath(rate, ['rateLimits.fileUploads.ipMax'], true)).toBe(true);
    expect(entryHasPath(rate.children[0], ['rateLimits.enabled'], false)).toBe(false);
    expect(entryHasPath(custom.children[0], ['endpoints.custom'], false)).toBe(true);
    expect(entryHasPath(custom.children[0], ['endpoints.custom'], false, false)).toBe(false);
    expect(entryHasPath(custom.children[0], ['endpoints.custom.0.baseURL'], false, false)).toBe(
      true,
    );
    expect(entryHasPath(custom, ['endpoints.openAI.titleModel'], true)).toBe(false);
  });
});
