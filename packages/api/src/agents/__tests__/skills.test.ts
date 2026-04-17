/**
 * Mock the pieces of `@librechat/agents` the installed SDK version may not
 * export yet. Includes both the `Constants.SKILL_TOOL` stub and the skill
 * catalog/tool-definition helpers needed to exercise `injectSkillCatalog`.
 */
jest.mock('@librechat/agents', () => ({
  ...jest.requireActual('@librechat/agents'),
  Constants: {
    ...(jest.requireActual('@librechat/agents') as { Constants: Record<string, unknown> })
      .Constants,
    SKILL_TOOL: 'skill',
  },
  formatSkillCatalog: (skills: Array<{ name: string; description: string }>) =>
    skills.map((s) => `- ${s.name}: ${s.description}`).join('\n'),
  SkillToolDefinition: { name: 'skill', description: 'skill tool', parameters: {} },
  ReadFileToolDefinition: {
    name: 'read_file',
    description: 'read file',
    parameters: {},
    responseFormat: 'content',
  },
  BashExecutionToolDefinition: {
    name: 'bash_tool',
    description: 'bash',
    schema: {},
  },
}));

import { Types } from 'mongoose';
import {
  scopeSkillIds,
  resolveSkillActive,
  injectSkillCatalog,
  primeManualSkill,
  resolveManualSkills,
} from '../skills';
import { extractInvokedSkillsFromPayload } from '../run';

type PageSkill = {
  _id: Types.ObjectId;
  name: string;
  description: string;
  author: Types.ObjectId;
};

describe('extractInvokedSkillsFromPayload', () => {
  it('extracts skill names from assistant messages with skill tool_calls', () => {
    const payload = [
      { role: 'user', content: 'Analyze this' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_call',
            tool_call: {
              id: 'call_1',
              name: 'skill' /* Constants.SKILL_TOOL */,
              args: JSON.stringify({ skillName: 'pdf-analyzer' }),
              output: 'Skill loaded.',
            },
          },
        ],
      },
    ];

    const result = extractInvokedSkillsFromPayload(payload);
    expect(result).toEqual(new Set(['pdf-analyzer']));
  });

  it('handles object args (not stringified)', () => {
    const payload = [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_call',
            tool_call: {
              id: 'call_1',
              name: 'skill' /* Constants.SKILL_TOOL */,
              args: { skillName: 'code-review' },
              output: 'Loaded.',
            },
          },
        ],
      },
    ];

    const result = extractInvokedSkillsFromPayload(payload);
    expect(result).toEqual(new Set(['code-review']));
  });

  it('returns empty set for no skill tool_calls', () => {
    const payload = [
      { role: 'user', content: 'Hello' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_call',
            tool_call: { id: 'call_1', name: 'web_search', args: '{}', output: 'Results' },
          },
        ],
      },
    ];

    const result = extractInvokedSkillsFromPayload(payload);
    expect(result.size).toBe(0);
  });

  it('skips non-assistant messages', () => {
    const payload = [
      {
        role: 'user',
        content: [
          {
            type: 'tool_call',
            tool_call: {
              id: 'call_1',
              name: 'skill' /* Constants.SKILL_TOOL */,
              args: '{"skillName":"x"}',
              output: '',
            },
          },
        ],
      },
    ];

    const result = extractInvokedSkillsFromPayload(payload);
    expect(result.size).toBe(0);
  });

  it('gracefully handles malformed JSON args', () => {
    const payload = [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_call',
            tool_call: {
              id: 'call_1',
              name: 'skill' /* Constants.SKILL_TOOL */,
              args: '{bad json',
              output: '',
            },
          },
        ],
      },
    ];

    const result = extractInvokedSkillsFromPayload(payload);
    expect(result.size).toBe(0);
  });

  it('skips empty skillName', () => {
    const payload = [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_call',
            tool_call: {
              id: 'call_1',
              name: 'skill' /* Constants.SKILL_TOOL */,
              args: '{"skillName":""}',
              output: '',
            },
          },
        ],
      },
    ];

    const result = extractInvokedSkillsFromPayload(payload);
    expect(result.size).toBe(0);
  });

  it('returns empty set for empty payload', () => {
    expect(extractInvokedSkillsFromPayload([]).size).toBe(0);
  });

  it('deduplicates across multiple messages', () => {
    const payload = [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_call',
            tool_call: {
              id: 'c1',
              name: 'skill' /* Constants.SKILL_TOOL */,
              args: '{"skillName":"pdf"}',
              output: '',
            },
          },
        ],
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_call',
            tool_call: {
              id: 'c2',
              name: 'skill' /* Constants.SKILL_TOOL */,
              args: '{"skillName":"pdf"}',
              output: '',
            },
          },
        ],
      },
    ];

    const result = extractInvokedSkillsFromPayload(payload);
    expect(result.size).toBe(1);
    expect(result.has('pdf')).toBe(true);
  });
});

describe('scopeSkillIds', () => {
  const makeId = () => new Types.ObjectId();

  it('returns the full set when agentSkills is undefined (not configured)', () => {
    const a = makeId();
    const b = makeId();
    const accessible = [a, b];
    expect(scopeSkillIds(accessible, undefined)).toBe(accessible);
  });

  it('returns the full set when agentSkills is null (not configured)', () => {
    const a = makeId();
    const b = makeId();
    const accessible = [a, b];
    expect(scopeSkillIds(accessible, null)).toBe(accessible);
  });

  it('returns [] when agentSkills is an empty array (explicit none)', () => {
    const accessible = [makeId(), makeId()];
    expect(scopeSkillIds(accessible, [])).toEqual([]);
  });

  it('returns intersection when agentSkills overlaps accessibleSkillIds', () => {
    const a = makeId();
    const b = makeId();
    const c = makeId();
    const accessible = [a, b, c];
    const scoped = scopeSkillIds(accessible, [a.toString(), c.toString()]);
    expect(scoped).toHaveLength(2);
    expect(scoped.map((o) => o.toString())).toEqual([a.toString(), c.toString()]);
  });

  it('returns [] when agentSkills is disjoint from accessibleSkillIds', () => {
    const a = makeId();
    const b = makeId();
    const accessible = [a, b];
    const unrelated = makeId().toString();
    expect(scopeSkillIds(accessible, [unrelated])).toEqual([]);
  });

  it('returns the full accessible set when agentSkills exactly matches it', () => {
    const a = makeId();
    const b = makeId();
    const accessible = [a, b];
    const scoped = scopeSkillIds(accessible, [a.toString(), b.toString()]);
    expect(scoped).toHaveLength(2);
    expect(scoped.map((o) => o.toString()).sort()).toEqual([a.toString(), b.toString()].sort());
  });

  it('filters out agentSkills entries that the user does not have ACL access to', () => {
    const a = makeId();
    const accessible = [a];
    const notAccessible = makeId().toString();
    const scoped = scopeSkillIds(accessible, [a.toString(), notAccessible]);
    expect(scoped).toHaveLength(1);
    expect(scoped[0].toString()).toBe(a.toString());
  });

  it('returns [] when accessibleSkillIds is empty regardless of agentSkills', () => {
    expect(scopeSkillIds([], undefined)).toEqual([]);
    expect(scopeSkillIds([], [])).toEqual([]);
    expect(scopeSkillIds([], [new Types.ObjectId().toString()])).toEqual([]);
  });
});

describe('resolveSkillActive', () => {
  const makeSkill = (author: Types.ObjectId) => ({ _id: new Types.ObjectId(), author });

  it('fails closed when userId is undefined and no override is set', () => {
    const skill = makeSkill(new Types.ObjectId());
    expect(
      resolveSkillActive({
        skill,
        skillStates: {},
        userId: undefined,
        defaultActiveOnShare: true,
      }),
    ).toBe(false);
  });

  it('fails closed when userId is undefined even if defaultActiveOnShare is true', () => {
    const skill = makeSkill(new Types.ObjectId());
    expect(
      resolveSkillActive({
        skill,
        userId: undefined,
        defaultActiveOnShare: true,
      }),
    ).toBe(false);
  });

  it('respects explicit override = true regardless of ownership or config', () => {
    const userId = new Types.ObjectId().toString();
    const sharedSkill = makeSkill(new Types.ObjectId());
    expect(
      resolveSkillActive({
        skill: sharedSkill,
        skillStates: { [sharedSkill._id.toString()]: true },
        userId,
        defaultActiveOnShare: false,
      }),
    ).toBe(true);
  });

  it('respects explicit override = false even for owned skills', () => {
    const userObjectId = new Types.ObjectId();
    const userId = userObjectId.toString();
    const ownedSkill = makeSkill(userObjectId);
    expect(
      resolveSkillActive({
        skill: ownedSkill,
        skillStates: { [ownedSkill._id.toString()]: false },
        userId,
        defaultActiveOnShare: true,
      }),
    ).toBe(false);
  });

  it('owned skills default to active when no override is present', () => {
    const userObjectId = new Types.ObjectId();
    const userId = userObjectId.toString();
    const ownedSkill = makeSkill(userObjectId);
    expect(
      resolveSkillActive({
        skill: ownedSkill,
        skillStates: {},
        userId,
        defaultActiveOnShare: false,
      }),
    ).toBe(true);
  });

  it('shared skills default to inactive when defaultActiveOnShare is false', () => {
    const userId = new Types.ObjectId().toString();
    const sharedSkill = makeSkill(new Types.ObjectId());
    expect(
      resolveSkillActive({
        skill: sharedSkill,
        skillStates: {},
        userId,
        defaultActiveOnShare: false,
      }),
    ).toBe(false);
  });

  it('shared skills default to active when defaultActiveOnShare is true', () => {
    const userId = new Types.ObjectId().toString();
    const sharedSkill = makeSkill(new Types.ObjectId());
    expect(
      resolveSkillActive({
        skill: sharedSkill,
        skillStates: {},
        userId,
        defaultActiveOnShare: true,
      }),
    ).toBe(true);
  });

  it('treats skillStates = undefined identically to an empty object', () => {
    const userObjectId = new Types.ObjectId();
    const userId = userObjectId.toString();
    const ownedSkill = makeSkill(userObjectId);
    const sharedSkill = makeSkill(new Types.ObjectId());

    expect(resolveSkillActive({ skill: ownedSkill, userId, defaultActiveOnShare: false })).toBe(
      resolveSkillActive({
        skill: ownedSkill,
        skillStates: {},
        userId,
        defaultActiveOnShare: false,
      }),
    );
    expect(resolveSkillActive({ skill: sharedSkill, userId, defaultActiveOnShare: true })).toBe(
      resolveSkillActive({
        skill: sharedSkill,
        skillStates: {},
        userId,
        defaultActiveOnShare: true,
      }),
    );
  });

  it('defaults defaultActiveOnShare to false when the param is omitted', () => {
    const userId = new Types.ObjectId().toString();
    const sharedSkill = makeSkill(new Types.ObjectId());
    expect(resolveSkillActive({ skill: sharedSkill, skillStates: {}, userId })).toBe(false);
  });

  it('ignores defaultActiveOnShare for owned skills', () => {
    const userObjectId = new Types.ObjectId();
    const userId = userObjectId.toString();
    const ownedSkill = makeSkill(userObjectId);
    expect(
      resolveSkillActive({
        skill: ownedSkill,
        skillStates: {},
        userId,
        defaultActiveOnShare: false,
      }),
    ).toBe(true);
  });
});

describe('injectSkillCatalog', () => {
  const userId = new Types.ObjectId().toString();
  const userObjectId = new Types.ObjectId(userId);

  /** Minimal `Agent` shape `injectSkillCatalog` actually reads/writes. */
  type MockAgent = Parameters<typeof injectSkillCatalog>[0]['agent'];

  function makeAgent(): MockAgent {
    return { additional_instructions: undefined } as MockAgent;
  }

  function makeSkill(name: string, author: Types.ObjectId = userObjectId): PageSkill {
    return {
      _id: new Types.ObjectId(),
      name,
      description: `desc-${name}`,
      author,
    };
  }

  function buildPager(pages: PageSkill[][]) {
    return jest.fn().mockImplementation(async ({ cursor }: { cursor?: string | null }) => {
      const pageIndex = cursor ? Number(cursor) : 0;
      const skills = pages[pageIndex] ?? [];
      const has_more = pageIndex < pages.length - 1;
      return {
        skills,
        has_more,
        after: has_more ? String(pageIndex + 1) : null,
      };
    });
  }

  function baseParams(overrides: Partial<Parameters<typeof injectSkillCatalog>[0]> = {}) {
    return {
      agent: makeAgent(),
      toolDefinitions: undefined,
      toolRegistry: undefined,
      accessibleSkillIds: [new Types.ObjectId()],
      contextWindowTokens: 200_000,
      listSkillsByAccess: jest.fn(),
      userId,
      skillStates: {},
      defaultActiveOnShare: false,
      ...overrides,
    };
  }

  it('returns empty when no skills are accessible', async () => {
    const result = await injectSkillCatalog(
      baseParams({ accessibleSkillIds: [], listSkillsByAccess: jest.fn() }),
    );
    expect(result.skillCount).toBe(0);
    expect(result.activeSkillIds).toEqual([]);
  });

  it('returns empty when listSkillsByAccess is not provided', async () => {
    const result = await injectSkillCatalog(baseParams({ listSkillsByAccess: undefined }));
    expect(result.skillCount).toBe(0);
    expect(result.activeSkillIds).toEqual([]);
  });

  it('filters out inactive skills on a single page (shared, default inactive)', async () => {
    const owned = makeSkill('my-skill', userObjectId);
    const sharedInactive = makeSkill('other-skill', new Types.ObjectId());
    const listSkillsByAccess = buildPager([[owned, sharedInactive]]);
    const result = await injectSkillCatalog(baseParams({ listSkillsByAccess }));
    expect(result.skillCount).toBe(1);
    expect(result.activeSkillIds.map((id) => id.toString())).toEqual([owned._id.toString()]);
  });

  it('includes shared skills when defaultActiveOnShare is true', async () => {
    const shared = makeSkill('other-skill', new Types.ObjectId());
    const listSkillsByAccess = buildPager([[shared]]);
    const result = await injectSkillCatalog(
      baseParams({ listSkillsByAccess, defaultActiveOnShare: true }),
    );
    expect(result.skillCount).toBe(1);
    expect(result.activeSkillIds.map((id) => id.toString())).toEqual([shared._id.toString()]);
  });

  it('honors explicit overrides (deactivated owned skill absent from catalog)', async () => {
    const owned = makeSkill('off', userObjectId);
    const listSkillsByAccess = buildPager([[owned]]);
    const result = await injectSkillCatalog(
      baseParams({
        listSkillsByAccess,
        skillStates: { [owned._id.toString()]: false },
      }),
    );
    expect(result.skillCount).toBe(0);
    expect(result.activeSkillIds).toEqual([]);
  });

  it('paginates across pages and collects active skills from later pages', async () => {
    const sharedInactive = Array.from({ length: 3 }, (_, i) =>
      makeSkill(`shared-${i}`, new Types.ObjectId()),
    );
    const owned = makeSkill('my-skill', userObjectId);
    const listSkillsByAccess = buildPager([sharedInactive, [owned]]);
    const result = await injectSkillCatalog(baseParams({ listSkillsByAccess }));
    expect(result.skillCount).toBe(1);
    expect(result.activeSkillIds.map((id) => id.toString())).toEqual([owned._id.toString()]);
    expect(listSkillsByAccess).toHaveBeenCalledTimes(2);
  });

  it('stops paginating at MAX_CATALOG_PAGES even if no active skills found', async () => {
    const inactivePage = Array.from({ length: 10 }, (_, i) =>
      makeSkill(`shared-${i}`, new Types.ObjectId()),
    );
    // Build 12 pages, all inactive — scanner should stop at page cap.
    const pages = Array.from({ length: 12 }, () => inactivePage);
    const listSkillsByAccess = buildPager(pages);
    const result = await injectSkillCatalog(baseParams({ listSkillsByAccess }));
    expect(result.skillCount).toBe(0);
    expect(result.activeSkillIds).toEqual([]);
    // MAX_CATALOG_PAGES = 10 — loop terminates after exactly 10 page fetches.
    expect(listSkillsByAccess).toHaveBeenCalledTimes(10);
  });

  it('terminates early when has_more is false even below the catalog limit', async () => {
    const owned = makeSkill('solo', userObjectId);
    const listSkillsByAccess = buildPager([[owned]]);
    await injectSkillCatalog(baseParams({ listSkillsByAccess }));
    expect(listSkillsByAccess).toHaveBeenCalledTimes(1);
  });

  it('appends the catalog text to agent.additional_instructions', async () => {
    const owned = makeSkill('my-skill', userObjectId);
    const listSkillsByAccess = buildPager([[owned]]);
    const agent = makeAgent();
    await injectSkillCatalog(baseParams({ listSkillsByAccess, agent }));
    expect(agent.additional_instructions).toContain('my-skill');
    expect(agent.additional_instructions).toContain('desc-my-skill');
  });

  it('fails closed when userId is absent (shared skills drop, owned would need override)', async () => {
    const owned = makeSkill('my-skill', userObjectId);
    const shared = makeSkill('shared-skill', new Types.ObjectId());
    const listSkillsByAccess = buildPager([[owned, shared]]);
    const result = await injectSkillCatalog(
      baseParams({ listSkillsByAccess, userId: undefined, defaultActiveOnShare: true }),
    );
    expect(result.skillCount).toBe(0);
    expect(result.activeSkillIds).toEqual([]);
  });
});

describe('primeManualSkill', () => {
  it('produces a meta user message carrying SKILL.md body and skillName marker', () => {
    const msg = primeManualSkill({
      name: 'brand-guidelines',
      body: '# Brand guidelines\nUse blue.',
    });
    expect(msg).toEqual({
      role: 'user',
      content: '# Brand guidelines\nUse blue.',
      isMeta: true,
      source: 'skill',
      skillName: 'brand-guidelines',
    });
  });

  it('preserves empty-body content verbatim (resolver should filter before, but helper is agnostic)', () => {
    const msg = primeManualSkill({ name: 'bare', body: '' });
    expect(msg.content).toBe('');
    expect(msg.isMeta).toBe(true);
  });
});

describe('resolveManualSkills', () => {
  const userId = new Types.ObjectId().toString();
  const userOid = new Types.ObjectId(userId);
  const otherAuthor = new Types.ObjectId();

  type SkillDoc = {
    _id: Types.ObjectId;
    name: string;
    body: string;
    author: Types.ObjectId;
  };

  const buildGetSkillByName =
    (skills: Record<string, SkillDoc | null>) =>
    async (name: string, _accessibleIds: Types.ObjectId[]) =>
      skills[name] ?? null;

  const mkSkill = (name: string, author: Types.ObjectId, body = `body of ${name}`): SkillDoc => ({
    _id: new Types.ObjectId(),
    name,
    body,
    author,
  });

  it('returns empty when no names supplied', async () => {
    const result = await resolveManualSkills({
      names: [],
      getSkillByName: buildGetSkillByName({}),
      accessibleSkillIds: [new Types.ObjectId()],
      userId,
    });
    expect(result).toEqual([]);
  });

  it('returns empty when no accessible IDs (ACL empty)', async () => {
    const result = await resolveManualSkills({
      names: ['foo'],
      getSkillByName: buildGetSkillByName({ foo: mkSkill('foo', userOid) }),
      accessibleSkillIds: [],
      userId,
    });
    expect(result).toEqual([]);
  });

  it('resolves owned skills to { name, body } pairs by default', async () => {
    const owned = mkSkill('my-skill', userOid, 'MY SKILL BODY');
    const result = await resolveManualSkills({
      names: ['my-skill'],
      getSkillByName: buildGetSkillByName({ 'my-skill': owned }),
      accessibleSkillIds: [owned._id],
      userId,
    });
    expect(result).toEqual([{ name: 'my-skill', body: 'MY SKILL BODY' }]);
  });

  it('silently skips names with no backing skill (typo / ACL miss) without failing the batch', async () => {
    const real = mkSkill('real', userOid);
    const result = await resolveManualSkills({
      names: ['real', 'typo'],
      getSkillByName: buildGetSkillByName({ real }),
      accessibleSkillIds: [real._id],
      userId,
    });
    expect(result).toEqual([{ name: 'real', body: 'body of real' }]);
  });

  it('dedupes repeated names, preserving first occurrence order', async () => {
    const a = mkSkill('a', userOid);
    const b = mkSkill('b', userOid);
    const result = await resolveManualSkills({
      names: ['a', 'b', 'a', 'b', 'a'],
      getSkillByName: buildGetSkillByName({ a, b }),
      accessibleSkillIds: [a._id, b._id],
      userId,
    });
    expect(result.map((r) => r.name)).toEqual(['a', 'b']);
  });

  it('filters shared skills when defaultActiveOnShare is false (unless override active=true)', async () => {
    const shared = mkSkill('shared', otherAuthor);
    const result = await resolveManualSkills({
      names: ['shared'],
      getSkillByName: buildGetSkillByName({ shared }),
      accessibleSkillIds: [shared._id],
      userId,
      defaultActiveOnShare: false,
    });
    expect(result).toEqual([]);
  });

  it('allows shared skills when defaultActiveOnShare is true', async () => {
    const shared = mkSkill('shared', otherAuthor, 'shared-body');
    const result = await resolveManualSkills({
      names: ['shared'],
      getSkillByName: buildGetSkillByName({ shared }),
      accessibleSkillIds: [shared._id],
      userId,
      defaultActiveOnShare: true,
    });
    expect(result).toEqual([{ name: 'shared', body: 'shared-body' }]);
  });

  it('drops explicitly-deactivated skills (skillStates override wins over ownership default)', async () => {
    const owned = mkSkill('owned-off', userOid);
    const result = await resolveManualSkills({
      names: ['owned-off'],
      getSkillByName: buildGetSkillByName({ 'owned-off': owned }),
      accessibleSkillIds: [owned._id],
      userId,
      skillStates: { [owned._id.toString()]: false },
    });
    expect(result).toEqual([]);
  });

  it('allows explicitly-activated shared skill even when defaultActiveOnShare is false', async () => {
    const shared = mkSkill('shared-on', otherAuthor, 'on-body');
    const result = await resolveManualSkills({
      names: ['shared-on'],
      getSkillByName: buildGetSkillByName({ 'shared-on': shared }),
      accessibleSkillIds: [shared._id],
      userId,
      defaultActiveOnShare: false,
      skillStates: { [shared._id.toString()]: true },
    });
    expect(result).toEqual([{ name: 'shared-on', body: 'on-body' }]);
  });

  it('skips skills with empty bodies (priming nothing adds no value)', async () => {
    const empty = mkSkill('empty', userOid, '');
    const result = await resolveManualSkills({
      names: ['empty'],
      getSkillByName: buildGetSkillByName({ empty }),
      accessibleSkillIds: [empty._id],
      userId,
    });
    expect(result).toEqual([]);
  });

  it('swallows getSkillByName errors per-name so one bad lookup does not drop the rest', async () => {
    const good = mkSkill('good', userOid, 'good-body');
    const getSkillByName = async (name: string) => {
      if (name === 'boom') {
        throw new Error('db exploded');
      }
      return name === 'good' ? good : null;
    };
    const result = await resolveManualSkills({
      names: ['boom', 'good'],
      getSkillByName,
      accessibleSkillIds: [good._id],
      userId,
    });
    expect(result).toEqual([{ name: 'good', body: 'good-body' }]);
  });
});
