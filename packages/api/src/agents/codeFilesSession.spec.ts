import { Constants } from '@librechat/agents';
import type { CodeEnvFile, CodeSessionContext, ToolSessionMap } from '@librechat/agents';
import { seedCodeFilesIntoSessions } from './codeFilesSession';

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
});
