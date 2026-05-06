import { Constants } from '@librechat/agents';
import type { CodeEnvFile, CodeSessionContext, ToolSessionMap } from '@librechat/agents';
import {
  buildInitialToolSessions,
  seedCodeFilesIntoSessions,
  type CodeFilesAgent,
} from './codeFilesSession';

const file = (id: string, session_id: string, name: string): CodeEnvFile => ({
  id,
  session_id,
  name,
});

describe('seedCodeFilesIntoSessions', () => {
  it('returns existing map untouched when files is undefined', () => {
    const existing: ToolSessionMap = new Map();
    expect(seedCodeFilesIntoSessions(undefined, existing)).toBe(existing);
  });

  it('returns existing map untouched when files is empty', () => {
    const existing: ToolSessionMap = new Map();
    expect(seedCodeFilesIntoSessions([], existing)).toBe(existing);
  });

  it('returns undefined when no files and no existing map', () => {
    expect(seedCodeFilesIntoSessions(undefined, undefined)).toBeUndefined();
  });

  it('creates a new sessions map seeded with EXECUTE_CODE entry on first call', () => {
    const files = [file('f1', 'sess-1', 'data.csv')];
    const result = seedCodeFilesIntoSessions(files, undefined);

    expect(result).toBeDefined();
    const entry = result!.get(Constants.EXECUTE_CODE) as CodeSessionContext;
    expect(entry.session_id).toBe('sess-1');
    expect(entry.files).toEqual(files);
    expect(typeof entry.lastUpdated).toBe('number');
  });

  it('mutates the passed-in map (in-place seeding so caller can pass to createRun)', () => {
    const existing: ToolSessionMap = new Map();
    const result = seedCodeFilesIntoSessions([file('f1', 'sess-1', 'a.csv')], existing);
    expect(result).toBe(existing);
    expect(existing.has(Constants.EXECUTE_CODE)).toBe(true);
  });

  it('appends incoming files to a prior EXECUTE_CODE entry without dropping skill files', () => {
    const skillFile = file('skill-1', 'skill-sess', 'skill/util.py');
    const codeFile = file('user-1', 'user-sess', 'data.csv');

    const existing: ToolSessionMap = new Map();
    existing.set(Constants.EXECUTE_CODE, {
      session_id: 'skill-sess',
      files: [skillFile],
      lastUpdated: 1,
    } satisfies CodeSessionContext);

    const result = seedCodeFilesIntoSessions([codeFile], existing);
    const entry = result!.get(Constants.EXECUTE_CODE) as CodeSessionContext;
    expect(entry.files).toEqual([skillFile, codeFile]);
    expect(entry.session_id).toBe('skill-sess');
  });

  it('preserves prior representative session_id when merging', () => {
    const existing: ToolSessionMap = new Map();
    existing.set(Constants.EXECUTE_CODE, {
      session_id: 'skill-sess',
      files: [file('skill-1', 'skill-sess', 'a.py')],
      lastUpdated: 1,
    } satisfies CodeSessionContext);

    const result = seedCodeFilesIntoSessions([file('user-1', 'different-sess', 'b.csv')], existing);
    const entry = result!.get(Constants.EXECUTE_CODE) as CodeSessionContext;
    expect(entry.session_id).toBe('skill-sess');
  });

  it('skips seeding when incoming files have no session_id (defensive)', () => {
    const fileWithoutSession = { id: 'x', session_id: '', name: 'orphan.csv' } as CodeEnvFile;
    const result = seedCodeFilesIntoSessions([fileWithoutSession], undefined);
    expect(result).toBeUndefined();
  });

  it('dedupes incoming files that share session_id + id with existing entries', () => {
    /**
     * Regression for Codex review #2: shared conversation files commonly
     * appear in multiple agents' `primedCodeFiles`. Without dedupe,
     * `_injected_files` would grow proportionally to agent count and
     * inflate every `/exec` POST.
     */
    const shared = file('f1', 'sess-S', 'shared.csv');
    const result = seedCodeFilesIntoSessions([shared, shared, shared], undefined);
    const entry = result!.get(Constants.EXECUTE_CODE) as CodeSessionContext;
    expect(entry.files).toHaveLength(1);
    expect(entry.files![0].id).toBe('f1');
  });

  it('dedupes incoming files against pre-existing entries on merge', () => {
    const existing: ToolSessionMap = new Map();
    existing.set(Constants.EXECUTE_CODE, {
      session_id: 'skill-sess',
      files: [file('skill-1', 'skill-sess', 'a.py'), file('shared-1', 'sess-S', 'shared.csv')],
      lastUpdated: 1,
    } satisfies CodeSessionContext);

    const result = seedCodeFilesIntoSessions(
      [
        file('shared-1', 'sess-S', 'shared.csv'), // duplicate of prior entry
        file('new-1', 'sess-N', 'new.csv'),
      ],
      existing,
    );
    const entry = result!.get(Constants.EXECUTE_CODE) as CodeSessionContext;
    /* prior 2 + 1 new (the duplicate is dropped). */
    expect(entry.files).toHaveLength(3);
    expect(entry.files!.map((f) => f.id).sort()).toEqual(['new-1', 'shared-1', 'skill-1']);
  });

  it('treats same name + same session as a duplicate; same name + different sessions as distinct', () => {
    /**
     * The dedupe key is `(session_id, id)` — not `name` alone. Two
     * primed uploads can legitimately share a filename when they live
     * in different sandbox sessions (e.g. each agent re-uploaded the
     * same source file). Both should land in the seed.
     */
    const a = file('id-A', 'sess-A', 'data.csv');
    const b = file('id-B', 'sess-B', 'data.csv');
    const result = seedCodeFilesIntoSessions([a, a, b], undefined);
    const entry = result!.get(Constants.EXECUTE_CODE) as CodeSessionContext;
    expect(entry.files).toHaveLength(2);
    expect(entry.files!.map((f) => f.session_id).sort()).toEqual(['sess-A', 'sess-B']);
  });
});

describe('buildInitialToolSessions', () => {
  const agent = (
    name: string,
    primedCodeFiles?: CodeEnvFile[],
    subagents?: CodeFilesAgent[],
  ): CodeFilesAgent & { __label: string } => ({
    __label: name,
    primedCodeFiles,
    subagentAgentConfigs: subagents,
  });

  it('returns the skill sessions untouched when no agent contributes files', () => {
    const skillSessions: ToolSessionMap = new Map();
    skillSessions.set(Constants.EXECUTE_CODE, {
      session_id: 'skill-sess',
      files: [file('s1', 'skill-sess', 'a.py')],
      lastUpdated: 1,
    } satisfies CodeSessionContext);

    const result = buildInitialToolSessions({
      skillSessions,
      agents: [agent('primary'), agent('handoff')],
    });

    expect(result).toBe(skillSessions);
    const entry = result!.get(Constants.EXECUTE_CODE) as CodeSessionContext;
    expect(entry.files).toHaveLength(1);
  });

  it('returns undefined when no skills and no agents have primed files', () => {
    const result = buildInitialToolSessions({
      skillSessions: undefined,
      agents: [agent('primary')],
    });
    expect(result).toBeUndefined();
  });

  it('merges primary + handoff agents into one EXECUTE_CODE entry', () => {
    const primary = agent('primary', [file('p1', 'sess-P', 'data.csv')]);
    const handoff = agent('handoff', [file('h1', 'sess-H', 'report.md')]);

    const result = buildInitialToolSessions({
      agents: [primary, handoff],
    });

    const entry = result!.get(Constants.EXECUTE_CODE) as CodeSessionContext;
    expect(entry.files).toHaveLength(2);
    expect(entry.files!.map((f) => f.name).sort()).toEqual(['data.csv', 'report.md']);
  });

  it('walks recursively into subagentAgentConfigs (P2 fix)', () => {
    /**
     * Pure subagents are pruned out of `agentConfigs` after init but
     * retained on the parent's `subagentAgentConfigs`. The recursive
     * walk picks them up so their primed code files seed the same
     * shared `Graph.sessions[EXECUTE_CODE]` entry.
     */
    const grandchild = agent('grandchild', [file('g1', 'sess-G', 'nested.txt')]);
    const child = agent('child', [file('c1', 'sess-C', 'mid.txt')], [grandchild]);
    const primary = agent('primary', [file('p1', 'sess-P', 'top.txt')], [child]);

    const result = buildInitialToolSessions({
      agents: [primary],
    });

    const entry = result!.get(Constants.EXECUTE_CODE) as CodeSessionContext;
    const names = entry.files!.map((f) => f.name).sort();
    expect(names).toEqual(['mid.txt', 'nested.txt', 'top.txt']);
  });

  it('preserves the skill side representative session_id when merging', () => {
    const skillSessions: ToolSessionMap = new Map();
    skillSessions.set(Constants.EXECUTE_CODE, {
      session_id: 'skill-sess',
      files: [file('s1', 'skill-sess', 'a.py')],
      lastUpdated: 1,
    } satisfies CodeSessionContext);

    const result = buildInitialToolSessions({
      skillSessions,
      agents: [agent('primary', [file('p1', 'agent-sess', 'b.csv')])],
    });

    const entry = result!.get(Constants.EXECUTE_CODE) as CodeSessionContext;
    expect(entry.session_id).toBe('skill-sess');
    expect(entry.files).toHaveLength(2);
  });

  it('does not infinite-loop on a cycle in the subagent graph', () => {
    /**
     * Defensive: a misconfigured subagent graph can have A → B → A.
     * The visited Set keyed on object identity must terminate the walk.
     */
    const a = agent('A', [file('a1', 'sess-A', 'a.txt')]);
    const b = agent('B', [file('b1', 'sess-B', 'b.txt')]);
    a.subagentAgentConfigs = [b];
    b.subagentAgentConfigs = [a];

    const result = buildInitialToolSessions({ agents: [a] });

    const entry = result!.get(Constants.EXECUTE_CODE) as CodeSessionContext;
    expect(entry.files!.map((f) => f.name).sort()).toEqual(['a.txt', 'b.txt']);
  });

  it('skips undefined / null entries in the agents iterable (defensive)', () => {
    const result = buildInitialToolSessions({
      agents: [undefined, agent('primary', [file('p1', 'sess-P', 'x.txt')]), null] as Array<
        CodeFilesAgent | undefined | null
      >,
    });

    const entry = result!.get(Constants.EXECUTE_CODE) as CodeSessionContext;
    expect(entry.files).toHaveLength(1);
    expect(entry.files![0].name).toBe('x.txt');
  });

  it('walks primary-first so the primary supplies the representative session_id (no skill seed)', () => {
    /**
     * Regression: a LIFO stack would visit the last top-level agent
     * first, flipping which agent's first file becomes the
     * representative `session_id` written to the EXECUTE_CODE entry.
     * The walk is FIFO so the primary always lands first.
     */
    const primary = agent('primary', [file('p1', 'sess-PRIMARY', 'top.txt')]);
    const handoffA = agent('handoff-A', [file('a1', 'sess-A', 'a.txt')]);
    const handoffB = agent('handoff-B', [file('b1', 'sess-B', 'b.txt')]);

    const result = buildInitialToolSessions({
      agents: [primary, handoffA, handoffB],
    });

    const entry = result!.get(Constants.EXECUTE_CODE) as CodeSessionContext;
    expect(entry.session_id).toBe('sess-PRIMARY');
    /* All three agents still contributed their files into the merged set. */
    expect(entry.files!.map((f) => f.name).sort()).toEqual(['a.txt', 'b.txt', 'top.txt']);
    /* And the per-file session_ids are preserved (ToolNode injects per-file). */
    const byName = new Map(entry.files!.map((f) => [f.name, f.session_id]));
    expect(byName.get('top.txt')).toBe('sess-PRIMARY');
    expect(byName.get('a.txt')).toBe('sess-A');
    expect(byName.get('b.txt')).toBe('sess-B');
  });

  it('dedupes shared conversation files across multiple run agents (Codex review #2)', () => {
    /**
     * The realistic case: a conversation with a primary + handoff +
     * subagent all sharing the SAME `tool_resources.execute_code`
     * file_ids. Without dedupe, the same file ref would land in
     * `_injected_files` 3 times and bloat the `/exec` POST. With
     * dedupe, exactly one ref reaches the sandbox.
     */
    const sharedFile = file('shared-id', 'sess-shared', 'data.csv');
    const result = buildInitialToolSessions({
      agents: [
        agent('primary', [sharedFile, file('p1', 'sess-P', 'private.csv')]),
        agent('handoff', [sharedFile]),
        agent('subagent', [sharedFile, file('s1', 'sess-S', 'sub.csv')]),
      ],
    });

    const entry = result!.get(Constants.EXECUTE_CODE) as CodeSessionContext;
    expect(entry.files).toHaveLength(3);
    expect(entry.files!.map((f) => f.id).sort()).toEqual(['p1', 's1', 'shared-id']);
  });

  it('deduplicates a single agent referenced as both primary and a subagent', () => {
    /**
     * `agentConfigs` may include an agent that is also a subagent of
     * another. Visiting it twice would double-merge its files. The
     * visited Set prevents that.
     */
    const shared = agent('shared', [file('s1', 'sess-S', 'shared.csv')]);
    const primary = agent('primary', [file('p1', 'sess-P', 'top.csv')], [shared]);

    const result = buildInitialToolSessions({
      agents: [primary, shared],
    });

    const entry = result!.get(Constants.EXECUTE_CODE) as CodeSessionContext;
    expect(entry.files).toHaveLength(2);
    expect(entry.files!.map((f) => f.name).sort()).toEqual(['shared.csv', 'top.csv']);
  });
});
