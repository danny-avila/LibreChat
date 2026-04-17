import { Types } from 'mongoose';
import {
  MAX_KEY_LENGTH,
  MAX_RAW_PAYLOAD,
  MAX_SKILL_STATES,
  loadSkillStates,
  pruneOrphanSkillStates,
  resolveDefaultActiveOnShare,
  toSkillStatesRecord,
  validateSkillStatesPayload,
} from '../skillStates';

describe('toSkillStatesRecord', () => {
  it('converts a Mongoose Map to a plain record', () => {
    const map = new Map<string, boolean>([
      ['a', true],
      ['b', false],
    ]);
    expect(toSkillStatesRecord(map)).toEqual({ a: true, b: false });
  });

  it('returns a plain object unchanged', () => {
    const input = { x: true, y: false };
    expect(toSkillStatesRecord(input)).toBe(input);
  });

  it('returns {} for null, undefined, or primitives', () => {
    expect(toSkillStatesRecord(null)).toEqual({});
    expect(toSkillStatesRecord(undefined)).toEqual({});
    expect(toSkillStatesRecord('not-an-object' as unknown as Record<string, boolean>)).toEqual({});
  });
});

describe('resolveDefaultActiveOnShare', () => {
  it('returns true when config object has defaultActiveOnShare: true', () => {
    expect(resolveDefaultActiveOnShare({ defaultActiveOnShare: true })).toBe(true);
  });

  it('returns false when defaultActiveOnShare is false, missing, or non-boolean', () => {
    expect(resolveDefaultActiveOnShare({ defaultActiveOnShare: false })).toBe(false);
    expect(resolveDefaultActiveOnShare({})).toBe(false);
    expect(resolveDefaultActiveOnShare({ defaultActiveOnShare: 'true' })).toBe(false);
  });

  it('returns false for non-object config (boolean shorthand or missing)', () => {
    expect(resolveDefaultActiveOnShare(true)).toBe(false);
    expect(resolveDefaultActiveOnShare(null)).toBe(false);
    expect(resolveDefaultActiveOnShare(undefined)).toBe(false);
  });
});

describe('loadSkillStates', () => {
  it('returns the user\u2019s stored states and the admin-configured default', async () => {
    const getUserById = jest.fn().mockResolvedValue({
      skillStates: new Map([['skill-a', true]]),
    });
    const result = await loadSkillStates({
      userId: 'user-1',
      appConfig: { interfaceConfig: { skills: { defaultActiveOnShare: true } } },
      getUserById,
    });
    expect(result.skillStates).toEqual({ 'skill-a': true });
    expect(result.defaultActiveOnShare).toBe(true);
    expect(getUserById).toHaveBeenCalledWith('user-1', 'skillStates');
  });

  it('returns an empty record when the user has no stored states', async () => {
    const getUserById = jest.fn().mockResolvedValue({ skillStates: undefined });
    const result = await loadSkillStates({
      userId: 'user-1',
      appConfig: null,
      getUserById,
    });
    expect(result.skillStates).toEqual({});
    expect(result.defaultActiveOnShare).toBe(false);
  });

  it('handles a missing user doc gracefully', async () => {
    const getUserById = jest.fn().mockResolvedValue(null);
    const result = await loadSkillStates({
      userId: 'user-1',
      appConfig: {},
      getUserById,
    });
    expect(result.skillStates).toEqual({});
    expect(result.defaultActiveOnShare).toBe(false);
  });
});

describe('validateSkillStatesPayload', () => {
  it('accepts a valid ObjectId-keyed boolean map', () => {
    const payload = {
      [new Types.ObjectId().toString()]: true,
      [new Types.ObjectId().toString()]: false,
    };
    expect(validateSkillStatesPayload(payload)).toBeNull();
  });

  it('accepts an empty object', () => {
    expect(validateSkillStatesPayload({})).toBeNull();
  });

  it('rejects non-object payloads', () => {
    expect(validateSkillStatesPayload(null)?.message).toMatch(/plain object/);
    expect(validateSkillStatesPayload(undefined)?.message).toMatch(/plain object/);
    expect(validateSkillStatesPayload('string')?.message).toMatch(/plain object/);
    expect(validateSkillStatesPayload([])?.message).toMatch(/plain object/);
  });

  it('rejects payloads that exceed the raw sanity bound', () => {
    const payload: Record<string, boolean> = {};
    for (let i = 0; i < MAX_RAW_PAYLOAD + 1; i += 1) {
      payload[new Types.ObjectId().toString()] = true;
    }
    const error = validateSkillStatesPayload(payload);
    expect(error?.code).toBe('SKILL_STATES_PAYLOAD_TOO_LARGE');
    expect(error?.limit).toBe(MAX_RAW_PAYLOAD);
  });

  it('does not reject a payload at the strict 200-cap (enforcement happens post-prune)', () => {
    const payload: Record<string, boolean> = {};
    for (let i = 0; i < MAX_SKILL_STATES + 1; i += 1) {
      payload[new Types.ObjectId().toString()] = true;
    }
    expect(validateSkillStatesPayload(payload)).toBeNull();
  });

  it('rejects empty string keys', () => {
    expect(validateSkillStatesPayload({ '': true })?.message).toMatch(/non-empty string/);
  });

  it('rejects overlong keys', () => {
    const long = 'a'.repeat(MAX_KEY_LENGTH + 1);
    expect(validateSkillStatesPayload({ [long]: true })?.message).toMatch(/non-empty string/);
  });

  it('rejects keys that are not valid ObjectIds', () => {
    expect(validateSkillStatesPayload({ 'not-an-objectid': true })?.message).toMatch(
      /valid ObjectId/,
    );
  });

  it('rejects non-boolean values', () => {
    const id = new Types.ObjectId().toString();
    expect(validateSkillStatesPayload({ [id]: 'true' })?.message).toMatch(/boolean/);
    expect(validateSkillStatesPayload({ [id]: 1 })?.message).toMatch(/boolean/);
    expect(validateSkillStatesPayload({ [id]: null })?.message).toMatch(/boolean/);
  });
});

describe('pruneOrphanSkillStates', () => {
  const makeId = () => new Types.ObjectId().toString();

  it('drops entries for skills that do not exist', async () => {
    const kept = makeId();
    const orphan = makeId();
    const pruned = await pruneOrphanSkillStates(
      { [kept]: true, [orphan]: false },
      {
        findExistingSkillIds: async () => [kept],
        findAccessibleSkillIds: async () => [kept, orphan],
      },
    );
    expect(pruned).toEqual({ [kept]: true });
  });

  it('drops entries whose user access was revoked (skill exists but not accessible)', async () => {
    const kept = makeId();
    const revoked = makeId();
    const pruned = await pruneOrphanSkillStates(
      { [kept]: true, [revoked]: false },
      {
        findExistingSkillIds: async () => [kept, revoked],
        findAccessibleSkillIds: async () => [kept],
      },
    );
    expect(pruned).toEqual({ [kept]: true });
  });

  it('drops malformed (non-ObjectId) keys before querying', async () => {
    const kept = makeId();
    const findExistingSkillIds = jest.fn().mockResolvedValue([kept]);
    const findAccessibleSkillIds = jest.fn().mockResolvedValue([kept]);
    const pruned = await pruneOrphanSkillStates(
      { [kept]: true, 'not-an-objectid': false, '': true },
      { findExistingSkillIds, findAccessibleSkillIds },
    );
    expect(pruned).toEqual({ [kept]: true });
    expect(findExistingSkillIds).toHaveBeenCalledWith([kept]);
  });

  it('returns {} and skips DB calls when every key is malformed', async () => {
    const findExistingSkillIds = jest.fn();
    const findAccessibleSkillIds = jest.fn();
    const pruned = await pruneOrphanSkillStates(
      { 'bad-1': true, 'bad-2': false },
      { findExistingSkillIds, findAccessibleSkillIds },
    );
    expect(pruned).toEqual({});
    expect(findExistingSkillIds).not.toHaveBeenCalled();
    expect(findAccessibleSkillIds).not.toHaveBeenCalled();
  });

  it('issues existence and access queries in parallel (one await each)', async () => {
    const id = makeId();
    const existenceOrder: string[] = [];
    const findExistingSkillIds = jest.fn().mockImplementation(async () => {
      existenceOrder.push('existence:start');
      await Promise.resolve();
      existenceOrder.push('existence:done');
      return [id];
    });
    const findAccessibleSkillIds = jest.fn().mockImplementation(async () => {
      existenceOrder.push('access:start');
      await Promise.resolve();
      existenceOrder.push('access:done');
      return [id];
    });
    await pruneOrphanSkillStates({ [id]: true }, { findExistingSkillIds, findAccessibleSkillIds });
    // Both should start before either completes (Promise.all).
    expect(existenceOrder.slice(0, 2).sort()).toEqual(['access:start', 'existence:start']);
  });

  it('accepts Types.ObjectId instances in the accessible list', async () => {
    const id = new Types.ObjectId();
    const pruned = await pruneOrphanSkillStates(
      { [id.toString()]: true },
      {
        findExistingSkillIds: async () => [id.toString()],
        findAccessibleSkillIds: async () => [id],
      },
    );
    expect(pruned).toEqual({ [id.toString()]: true });
  });
});
