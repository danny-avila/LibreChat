import { Permissions, PermissionTypes, permissionsSchema } from 'librechat-data-provider';

import type { RolePermissions } from './types';

export interface PermissionBit {
  bit: Permissions;
  label: string;
}

export interface PermissionRow {
  type: PermissionTypes;
  label: string;
  description: string;
  bits: PermissionBit[];
}

export interface PermissionGroup {
  name: string;
  description: string;
  rows: PermissionRow[];
  columns: PermissionBit[];
}

export interface PermissionCell {
  type: PermissionTypes;
  bit: Permissions;
  label: string;
}

/**
 * Which bits are valid for which permission type is read from `permissionsSchema`, never
 * listed by hand here: it is the shape `updateAccessPermissions` validates every write
 * against (packages/data-schemas/src/methods/role.ts) and the exact mirror of the stored
 * `rolePermissionsSchema` (packages/data-schemas/src/schema/role.ts). A type or bit added
 * to the schema therefore reaches this screen with the schema that defines it; only the
 * labels and the grouping below are editorial.
 */
const schemaShape = permissionsSchema.shape;

const SCHEMA_TYPES = Object.keys(schemaShape) as PermissionTypes[];

const SCHEMA_TYPE_SET = new Set<string>(SCHEMA_TYPES);

const bitsOf = (type: PermissionTypes): Permissions[] =>
  Object.keys(schemaShape[type].shape) as Permissions[];

/** Column order for every group; a bit missing from it lands after the ones listed. */
const BIT_ORDER: Permissions[] = [
  Permissions.USE,
  Permissions.CREATE,
  Permissions.UPDATE,
  Permissions.READ,
  Permissions.READ_AUTHOR,
  Permissions.SHARE,
  Permissions.SHARE_PUBLIC,
  Permissions.OPT_OUT,
  Permissions.CONFIGURE_OBO,
  Permissions.VIEW_USERS,
  Permissions.VIEW_GROUPS,
  Permissions.VIEW_ROLES,
];

const BIT_LABELS: Partial<Record<Permissions, string>> = {
  [Permissions.USE]: 'Use',
  [Permissions.CREATE]: 'Create',
  [Permissions.UPDATE]: 'Update',
  [Permissions.READ]: 'Read',
  [Permissions.READ_AUTHOR]: 'See author',
  [Permissions.SHARE]: 'Share',
  [Permissions.SHARE_PUBLIC]: 'Share publicly',
  [Permissions.OPT_OUT]: 'Opt out',
  [Permissions.CONFIGURE_OBO]: 'Configure OBO',
  [Permissions.VIEW_USERS]: 'See users',
  [Permissions.VIEW_GROUPS]: 'See groups',
  [Permissions.VIEW_ROLES]: 'See roles',
};

const TYPE_LABELS: Partial<Record<PermissionTypes, { label: string; description: string }>> = {
  [PermissionTypes.AGENTS]: {
    label: 'Agents',
    description:
      'Build and run agents. “Share publicly” is what puts an agent in front of everyone.',
  },
  [PermissionTypes.REMOTE_AGENTS]: {
    label: 'Remote agents',
    description: 'Agents reached over the API rather than built in this deployment.',
  },
  [PermissionTypes.SKILLS]: {
    label: 'Skills',
    description: 'Reusable instruction packs an agent can load.',
  },
  [PermissionTypes.SCHEDULES]: {
    label: 'Scheduled chats',
    description: 'Conversations that run on a schedule without anyone present.',
  },
  [PermissionTypes.MARKETPLACE]: {
    label: 'Agent marketplace',
    description: 'The shared catalogue where published agents are found.',
  },
  [PermissionTypes.RUN_CODE]: {
    label: 'Code interpreter',
    description: 'Running generated code in the sandbox.',
  },
  [PermissionTypes.WEB_SEARCH]: {
    label: 'Web search',
    description: 'Searching the web from a conversation.',
  },
  [PermissionTypes.FILE_SEARCH]: {
    label: 'File search',
    description: 'Searching uploaded files with the vector store.',
  },
  [PermissionTypes.FILE_CITATIONS]: {
    label: 'File citations',
    description: 'Showing the passages an answer came from.',
  },
  [PermissionTypes.MCP_SERVERS]: {
    label: 'MCP servers',
    description:
      'Connecting external tools. “Configure OBO” lets the holder mint delegated user tokens and forward them to the server.',
  },
  [PermissionTypes.PROMPTS]: {
    label: 'Prompts',
    description: 'Saved prompt templates and prompt groups.',
  },
  [PermissionTypes.SHARED_LINKS]: {
    label: 'Shared chat links',
    description: 'Public links to a conversation.',
  },
  [PermissionTypes.BOOKMARKS]: {
    label: 'Bookmarks',
    description: 'Tagging conversations.',
  },
  [PermissionTypes.MULTI_CONVO]: {
    label: 'Multi-model chat',
    description: 'Answering one message with several models at once.',
  },
  [PermissionTypes.TEMPORARY_CHAT]: {
    label: 'Temporary chat',
    description: 'Conversations that are never stored.',
  },
  [PermissionTypes.MEMORIES]: {
    label: 'Memories',
    description: 'What the assistant remembers between conversations.',
  },
  [PermissionTypes.PEOPLE_PICKER]: {
    label: 'People picker',
    description: 'Which directory entries show up when sharing with someone.',
  },
};

const GROUP_DEFINITIONS: ReadonlyArray<{
  name: string;
  description: string;
  types: PermissionTypes[];
}> = [
  {
    name: 'Agents and automation',
    description: 'What a builder needs: creating agents, sharing them, and publishing them.',
    types: [
      PermissionTypes.AGENTS,
      PermissionTypes.REMOTE_AGENTS,
      PermissionTypes.SKILLS,
      PermissionTypes.SCHEDULES,
      PermissionTypes.MARKETPLACE,
    ],
  },
  {
    name: 'Tools and connectors',
    description: 'Capabilities an agent can reach for while it answers.',
    types: [
      PermissionTypes.RUN_CODE,
      PermissionTypes.WEB_SEARCH,
      PermissionTypes.FILE_SEARCH,
      PermissionTypes.FILE_CITATIONS,
      PermissionTypes.MCP_SERVERS,
    ],
  },
  {
    name: 'Prompts and sharing',
    description: 'Saved prompts and the links that take a conversation outside the workspace.',
    types: [PermissionTypes.PROMPTS, PermissionTypes.SHARED_LINKS],
  },
  {
    name: 'Chat features',
    description: 'Per-conversation conveniences.',
    types: [PermissionTypes.BOOKMARKS, PermissionTypes.MULTI_CONVO, PermissionTypes.TEMPORARY_CHAT],
  },
  {
    name: 'Memory',
    description: 'Long-term memory across conversations.',
    types: [PermissionTypes.MEMORIES],
  },
  {
    name: 'Directory visibility',
    description: 'Who this role can see when it picks someone to share with.',
    types: [PermissionTypes.PEOPLE_PICKER],
  },
];

const titleCase = (value: string): string =>
  value
    .toLowerCase()
    .split('_')
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(' ');

const toBit = (bit: Permissions): PermissionBit => ({
  bit,
  label: BIT_LABELS[bit] ?? titleCase(bit),
});

const buildRow = (type: PermissionTypes): PermissionRow => ({
  type,
  label: TYPE_LABELS[type]?.label ?? titleCase(type),
  description: TYPE_LABELS[type]?.description ?? '',
  bits: bitsOf(type).map(toBit),
});

const columnsOf = (rows: PermissionRow[]): PermissionBit[] => {
  const present = new Set<Permissions>();
  for (const row of rows) {
    for (const bit of row.bits) {
      present.add(bit.bit);
    }
  }
  const ordered = BIT_ORDER.filter((bit) => present.has(bit));
  const trailing = [...present].filter((bit) => !BIT_ORDER.includes(bit));
  return [...ordered, ...trailing].map(toBit);
};

const buildGroup = (
  name: string,
  description: string,
  types: PermissionTypes[],
): PermissionGroup => {
  const rows = types.map(buildRow);
  return { name, description, rows, columns: columnsOf(rows) };
};

const groupedTypes = new Set<string>(GROUP_DEFINITIONS.flatMap((group) => group.types));

const ungroupedTypes = SCHEMA_TYPES.filter((type) => !groupedTypes.has(type));

/** Grouping is editorial, so a type the schema gained lands in the trailing group rather than disappearing. */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  ...GROUP_DEFINITIONS.map((group) =>
    buildGroup(
      group.name,
      group.description,
      group.types.filter((type) => SCHEMA_TYPE_SET.has(type)),
    ),
  ).filter((group) => group.rows.length > 0),
  ...(ungroupedTypes.length > 0
    ? [
        buildGroup(
          'Not yet grouped',
          'Permission types the schema carries that this screen has no grouping for yet.',
          ungroupedTypes,
        ),
      ]
    : []),
];

const BUILDER_CANDIDATES: PermissionCell[] = [
  { type: PermissionTypes.AGENTS, bit: Permissions.CREATE, label: 'Create agents' },
  { type: PermissionTypes.AGENTS, bit: Permissions.SHARE, label: 'Share agents with named people' },
  {
    type: PermissionTypes.AGENTS,
    bit: Permissions.SHARE_PUBLIC,
    label: 'Publish agents to everyone',
  },
  { type: PermissionTypes.MARKETPLACE, bit: Permissions.USE, label: 'Open the agent marketplace' },
  { type: PermissionTypes.RUN_CODE, bit: Permissions.USE, label: 'Run code in the sandbox' },
];

/** The BUILDER case from the brief, filtered through the schema so it cannot name a dead bit. */
export const BUILDER_ESSENTIALS: PermissionCell[] = BUILDER_CANDIDATES.filter(
  (cell) => SCHEMA_TYPE_SET.has(cell.type) && bitsOf(cell.type).includes(cell.bit),
);

export const TOTAL_BITS = PERMISSION_GROUPS.reduce(
  (total, group) => total + group.rows.reduce((rowTotal, row) => rowTotal + row.bits.length, 0),
  0,
);

export const readBit = (
  permissions: RolePermissions,
  type: PermissionTypes,
  bit: Permissions,
): boolean => permissions[type]?.[bit] === true;

/**
 * Every valid bit becomes explicit, because `updateAccessPermissions` merges what it is
 * sent instead of replacing the block: a bit left out of the payload keeps its stored value.
 */
export const toDraft = (permissions: RolePermissions | undefined): RolePermissions => {
  const stored = permissions ?? {};
  const draft: RolePermissions = {};
  for (const group of PERMISSION_GROUPS) {
    for (const row of group.rows) {
      const block: Partial<Record<Permissions, boolean>> = {};
      for (const { bit } of row.bits) {
        block[bit] = stored[row.type]?.[bit] === true;
      }
      draft[row.type] = block;
    }
  }
  return draft;
};

export const withBit = (
  draft: RolePermissions,
  type: PermissionTypes,
  bit: Permissions,
  value: boolean,
): RolePermissions => ({ ...draft, [type]: { ...draft[type], [bit]: value } });

export const withCells = (
  draft: RolePermissions,
  cells: PermissionCell[],
  value: boolean,
): RolePermissions =>
  cells.reduce((next, cell) => withBit(next, cell.type, cell.bit, value), draft);

export const isSameDraft = (left: RolePermissions, right: RolePermissions): boolean => {
  for (const group of PERMISSION_GROUPS) {
    for (const row of group.rows) {
      for (const { bit } of row.bits) {
        if (readBit(left, row.type, bit) !== readBit(right, row.type, bit)) {
          return false;
        }
      }
    }
  }
  return true;
};

export const countGranted = (draft: RolePermissions): number => {
  let granted = 0;
  for (const group of PERMISSION_GROUPS) {
    for (const row of group.rows) {
      for (const { bit } of row.bits) {
        if (readBit(draft, row.type, bit)) {
          granted += 1;
        }
      }
    }
  }
  return granted;
};
