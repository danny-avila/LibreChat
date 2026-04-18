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
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import {
  scopeSkillIds,
  resolveSkillActive,
  injectSkillCatalog,
  buildSkillPrimeMessage,
  resolveManualSkills,
  injectManualSkillPrimes,
  extractManualSkills,
  isSkillPrimeMessage,
  buildSkillPrimeContentParts,
  buildSkillPrimeStepEvents,
  MAX_MANUAL_SKILLS,
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

describe('buildSkillPrimeMessage', () => {
  it('produces a meta user message carrying SKILL.md body and skillName marker', () => {
    const msg = buildSkillPrimeMessage({
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
    const msg = buildSkillPrimeMessage({ name: 'bare', body: '' });
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

  it('truncates manual skill lists above MAX_MANUAL_SKILLS to bound concurrent DB lookups', async () => {
    const skills: Record<string, SkillDoc> = {};
    const names: string[] = [];
    for (let i = 0; i < MAX_MANUAL_SKILLS + 5; i++) {
      const name = `s${i}`;
      skills[name] = mkSkill(name, userOid, `body-${i}`);
      names.push(name);
    }
    const getSkillByName = jest.fn(buildGetSkillByName(skills));
    const result = await resolveManualSkills({
      names,
      getSkillByName,
      accessibleSkillIds: names.map((n) => skills[n]._id),
      userId,
    });
    expect(result).toHaveLength(MAX_MANUAL_SKILLS);
    expect(getSkillByName).toHaveBeenCalledTimes(MAX_MANUAL_SKILLS);
    // Preserves input order — drops the tail, keeps the head.
    expect(result.map((r) => r.name)).toEqual(names.slice(0, MAX_MANUAL_SKILLS));
  });

  it('applies the cap AFTER dedup so repeated names do not consume slots', async () => {
    const skills: Record<string, SkillDoc> = {};
    const uniqueCount = MAX_MANUAL_SKILLS;
    for (let i = 0; i < uniqueCount; i++) {
      const name = `u${i}`;
      skills[name] = mkSkill(name, userOid, `body-${i}`);
    }
    // Duplicate every name 3x — total length 3 × MAX_MANUAL_SKILLS, unique = MAX_MANUAL_SKILLS.
    const names: string[] = [];
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < uniqueCount; i++) {
        names.push(`u${i}`);
      }
    }
    const result = await resolveManualSkills({
      names,
      getSkillByName: buildGetSkillByName(skills),
      accessibleSkillIds: Object.values(skills).map((s) => s._id),
      userId,
    });
    expect(result).toHaveLength(uniqueCount);
  });
});

describe('injectManualSkillPrimes', () => {
  const prime = (name: string, body: string) => ({ name, body });

  it('no-ops when manualSkillPrimes is empty', () => {
    const messages = [new HumanMessage('hello')];
    const map = { 0: 10 };
    const result = injectManualSkillPrimes({
      initialMessages: messages,
      indexTokenCountMap: map,
      manualSkillPrimes: [],
    });
    expect(result.inserted).toBe(0);
    expect(result.insertIdx).toBe(-1);
    expect(messages).toHaveLength(1);
    expect(result.indexTokenCountMap).toBe(map);
  });

  it('no-ops when initialMessages is empty', () => {
    const messages: HumanMessage[] = [];
    const result = injectManualSkillPrimes({
      initialMessages: messages,
      indexTokenCountMap: undefined,
      manualSkillPrimes: [prime('foo', 'body')],
    });
    expect(result.inserted).toBe(0);
    expect(result.insertIdx).toBe(-1);
    expect(messages).toHaveLength(0);
  });

  it('inserts a single prime right before the last message when there is only one message', () => {
    const userMsg = new HumanMessage('What is X?');
    const messages = [userMsg];
    const result = injectManualSkillPrimes({
      initialMessages: messages,
      indexTokenCountMap: { 0: 7 },
      manualSkillPrimes: [prime('x', 'X means...')],
    });
    expect(result.inserted).toBe(1);
    expect(result.insertIdx).toBe(0);
    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe('X means...');
    expect(messages[1]).toBe(userMsg);
    // The prior-index-0 count follows the message it was attached to: now at idx 1.
    expect(result.indexTokenCountMap).toEqual({ 1: 7 });
  });

  it('inserts multiple primes in input order right before the last message', () => {
    const messages: (HumanMessage | AIMessage)[] = [
      new HumanMessage('turn 1 user'),
      new AIMessage('turn 1 reply'),
      new HumanMessage('turn 2 user'),
    ];
    const result = injectManualSkillPrimes({
      initialMessages: messages,
      indexTokenCountMap: { 0: 1, 1: 2, 2: 3 },
      manualSkillPrimes: [prime('a', 'A body'), prime('b', 'B body')],
    });
    expect(result.inserted).toBe(2);
    expect(result.insertIdx).toBe(2);
    expect(messages).toHaveLength(5);
    expect(messages[0].content).toBe('turn 1 user');
    expect(messages[1].content).toBe('turn 1 reply');
    expect(messages[2].content).toBe('A body');
    expect(messages[3].content).toBe('B body');
    expect(messages[4].content).toBe('turn 2 user');
    // idx 0 unchanged, idx 1 unchanged, idx 2 shifts to 4 (+ numPrimes).
    expect(result.indexTokenCountMap).toEqual({ 0: 1, 1: 2, 4: 3 });
  });

  it('primes carry isMeta / source / skillName advisory markers in additional_kwargs', () => {
    const messages = [new HumanMessage('hi')];
    injectManualSkillPrimes({
      initialMessages: messages,
      indexTokenCountMap: undefined,
      manualSkillPrimes: [prime('brand', 'brand-body')],
    });
    const primed = messages[0] as HumanMessage;
    expect(primed.additional_kwargs).toEqual({
      isMeta: true,
      source: 'skill',
      skillName: 'brand',
    });
  });

  it('uses `>=` when shifting the map so the message originally at insertIdx follows its count forward', () => {
    // Regression guard: a `>` bug here would leave the last user message's
    // token count attached to one of the new primes instead.
    const messages = [new HumanMessage('older'), new HumanMessage('latest')];
    const result = injectManualSkillPrimes({
      initialMessages: messages,
      indexTokenCountMap: { 0: 5, 1: 11 },
      manualSkillPrimes: [prime('x', 'x body')],
    });
    // insertIdx = 1, numPrimes = 1. Entry at idx 1 must move to idx 2.
    expect(result.indexTokenCountMap).toEqual({ 0: 5, 2: 11 });
  });

  it('handles undefined indexTokenCountMap (formatAgentMessages omitted the map)', () => {
    const messages = [new HumanMessage('hi')];
    const result = injectManualSkillPrimes({
      initialMessages: messages,
      indexTokenCountMap: undefined,
      manualSkillPrimes: [prime('x', 'body')],
    });
    expect(result.inserted).toBe(1);
    expect(result.indexTokenCountMap).toBeUndefined();
  });
});

describe('extractManualSkills', () => {
  it('returns undefined for null / non-object bodies', () => {
    expect(extractManualSkills(null)).toBeUndefined();
    expect(extractManualSkills(undefined)).toBeUndefined();
    expect(extractManualSkills('string')).toBeUndefined();
    expect(extractManualSkills(42)).toBeUndefined();
  });

  it('returns undefined when manualSkills is missing or not an array', () => {
    expect(extractManualSkills({})).toBeUndefined();
    expect(extractManualSkills({ manualSkills: 'foo' })).toBeUndefined();
    expect(extractManualSkills({ manualSkills: { 0: 'foo' } })).toBeUndefined();
  });

  it('passes through valid string[] input untouched', () => {
    expect(extractManualSkills({ manualSkills: ['a', 'b'] })).toEqual(['a', 'b']);
  });

  it('filters out non-string elements that a TS-oblivious payload might include', () => {
    expect(
      extractManualSkills({
        manualSkills: ['ok', 123, null, { $gt: '' }, undefined, 'also-ok'],
      }),
    ).toEqual(['ok', 'also-ok']);
  });

  it('filters out empty strings', () => {
    expect(extractManualSkills({ manualSkills: ['', 'real', ''] })).toEqual(['real']);
  });

  it('returns undefined when the array is present but contains no valid strings', () => {
    expect(extractManualSkills({ manualSkills: [123, null, ''] })).toBeUndefined();
    expect(extractManualSkills({ manualSkills: [] })).toBeUndefined();
  });
});

describe('isSkillPrimeMessage', () => {
  it('returns true for a prime produced by injectManualSkillPrimes', () => {
    const messages = [new HumanMessage('user turn')];
    injectManualSkillPrimes({
      initialMessages: messages,
      indexTokenCountMap: undefined,
      manualSkillPrimes: [{ name: 'x', body: 'x body' }],
    });
    expect(isSkillPrimeMessage(messages[0])).toBe(true);
  });

  it('returns false for plain HumanMessage / AIMessage without the marker', () => {
    expect(isSkillPrimeMessage(new HumanMessage('hi'))).toBe(false);
    expect(isSkillPrimeMessage(new AIMessage('reply'))).toBe(false);
  });

  it('returns false for additional_kwargs with a different source', () => {
    const m = new HumanMessage({
      content: 'x',
      additional_kwargs: { source: 'not-a-skill' },
    });
    expect(isSkillPrimeMessage(m)).toBe(false);
  });

  it('returns false for non-object / null / undefined inputs', () => {
    expect(isSkillPrimeMessage(null)).toBe(false);
    expect(isSkillPrimeMessage(undefined)).toBe(false);
    expect(isSkillPrimeMessage('just a string')).toBe(false);
    expect(isSkillPrimeMessage(42)).toBe(false);
  });

  it('filter() on a mixed array keeps the non-prime messages', () => {
    const user = new HumanMessage('real turn');
    const messages: (HumanMessage | AIMessage)[] = [new AIMessage('reply'), user];
    injectManualSkillPrimes({
      initialMessages: messages,
      indexTokenCountMap: undefined,
      manualSkillPrimes: [{ name: 'x', body: 'x body' }],
    });
    // After priming: [AIMessage, primeHumanMessage, user]
    const stripped = messages.filter((m) => !isSkillPrimeMessage(m));
    expect(stripped).toHaveLength(2);
    expect(stripped[1]).toBe(user);
  });
});

describe('buildSkillPrimeContentParts', () => {
  it('produces one completed tool_call content part per prime', () => {
    const parts = buildSkillPrimeContentParts(
      [
        { name: 'brand', body: '# Brand' },
        { name: 'legal', body: '# Legal' },
      ],
      { runId: 'msg_abc' },
    );
    expect(parts).toHaveLength(2);
    expect(parts[0].type).toBe('tool_call');
    expect(parts[0].tool_call.name).toBe('skill');
    expect(parts[0].tool_call.progress).toBe(1);
    expect(parts[0].tool_call.type).toBe('tool_call');
  });

  it('encodes skillName as a JSON string in args (matches the SkillCall renderer contract)', () => {
    const [part] = buildSkillPrimeContentParts([{ name: 'pdf-reader', body: '...' }], {
      runId: 'msg_1',
    });
    expect(JSON.parse(part.tool_call.args)).toEqual({ skillName: 'pdf-reader' });
  });

  it('produces a human-readable output string the frontend can expand', () => {
    const [part] = buildSkillPrimeContentParts([{ name: 'research', body: '...' }], {
      runId: 'msg_1',
    });
    expect(part.tool_call.output).toContain('research');
    expect(part.tool_call.output).toContain('loaded');
  });

  it('assigns unique tool_call IDs seeded from runId + index', () => {
    const parts = buildSkillPrimeContentParts(
      [
        { name: 'a', body: 'a' },
        { name: 'b', body: 'b' },
      ],
      { runId: 'msg_xyz' },
    );
    const ids = parts.map((p) => p.tool_call.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids[0]).toContain('msg_xyz');
    expect(ids[1]).toContain('msg_xyz');
  });

  it('returns an empty array for empty input', () => {
    expect(buildSkillPrimeContentParts([], { runId: 'msg_1' })).toEqual([]);
  });

  it('respects startOffset when seeding IDs (callers prepending to a populated list)', () => {
    const first = buildSkillPrimeContentParts([{ name: 'x', body: 'x' }], { runId: 'msg_1' });
    const second = buildSkillPrimeContentParts([{ name: 'x', body: 'x' }], {
      runId: 'msg_1',
      startOffset: 5,
    });
    expect(first[0].tool_call.id).not.toBe(second[0].tool_call.id);
  });
});

describe('buildSkillPrimeStepEvents', () => {
  it('emits a run_step + run_step_completed pair per prime', () => {
    const events = buildSkillPrimeStepEvents([
      { name: 'alpha', body: '...' },
      { name: 'beta', body: '...' },
    ]);
    expect(events).toHaveLength(4);
    expect(events[0].event).toBe('on_run_step');
    expect(events[1].event).toBe('on_run_step_completed');
    expect(events[2].event).toBe('on_run_step');
    expect(events[3].event).toBe('on_run_step_completed');
  });

  it('uses USE_PRELIM_RESPONSE_MESSAGE_ID as the default runId so the frontend maps events to the in-flight response', () => {
    const [start] = buildSkillPrimeStepEvents([{ name: 'x', body: '...' }]);
    expect(start.data.runId).toBe('USE_PRELIM_RESPONSE_MESSAGE_ID');
  });

  it('honors an explicit runId', () => {
    const [start] = buildSkillPrimeStepEvents([{ name: 'x', body: '...' }], {
      runId: 'custom_run_id',
    });
    expect(start.data.runId).toBe('custom_run_id');
  });

  it('sets stepDetails to TOOL_CALLS with the skill tool name and JSON-encoded skillName args', () => {
    const [start] = buildSkillPrimeStepEvents([{ name: 'brand', body: '...' }]);
    const details = start.data.stepDetails as {
      type: string;
      tool_calls: Array<{ name: string; args: string }>;
    };
    expect(details.type).toBe('tool_calls');
    expect(details.tool_calls).toHaveLength(1);
    expect(details.tool_calls[0].name).toBe('skill');
    expect(JSON.parse(details.tool_calls[0].args)).toEqual({ skillName: 'brand' });
  });

  it('marks the completed event with progress: 1 and a loaded-output string', () => {
    const [, completed] = buildSkillPrimeStepEvents([{ name: 'brand', body: '...' }]);
    const result = (
      completed.data as { result: { tool_call: { progress: number; output: string } } }
    ).result;
    expect(result.tool_call.progress).toBe(1);
    expect(result.tool_call.output).toContain('brand');
    expect(result.tool_call.output).toContain('loaded');
  });

  it('starts indices at SKILL_PRIME_INDEX_OFFSET by default so cards sit clear of LLM index-0 content', () => {
    const events = buildSkillPrimeStepEvents([
      { name: 'a', body: '.' },
      { name: 'b', body: '.' },
      { name: 'c', body: '.' },
    ]);
    const startEvents = events.filter((e) => e.event === 'on_run_step');
    expect(startEvents.map((e) => e.data.index)).toEqual([100, 101, 102]);
  });

  it('honors an explicit startIndex for callers that want cards at a different offset', () => {
    const events = buildSkillPrimeStepEvents([{ name: 'a', body: '.' }], { startIndex: 0 });
    const startEvents = events.filter((e) => e.event === 'on_run_step');
    expect(startEvents[0].data.index).toBe(0);
  });

  it('pairs start + completed via the same stepId and tool_call ID', () => {
    const [start, completed] = buildSkillPrimeStepEvents([{ name: 'x', body: '.' }]);
    const startToolCallId = (start.data.stepDetails as { tool_calls: Array<{ id: string }> })
      .tool_calls[0].id;
    const completedResult = (
      completed.data as {
        result: { id: string; tool_call: { id: string } };
      }
    ).result;
    expect(completedResult.id).toBe(start.data.id);
    expect(completedResult.tool_call.id).toBe(startToolCallId);
  });

  it('returns an empty array for empty input', () => {
    expect(buildSkillPrimeStepEvents([])).toEqual([]);
  });
});
