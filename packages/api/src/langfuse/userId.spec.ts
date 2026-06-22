import { getLangfuseUserId } from './userId';
import type { IUser } from '@librechat/data-schemas';

const makeUser = (overrides: Partial<IUser> = {}): IUser =>
  ({
    id: 'mongo-id-123',
    email: 'alice@example.com',
    username: 'alice',
    name: 'Alice Smith',
    provider: 'local',
    ...overrides,
  }) as unknown as IUser;

describe('getLangfuseUserId', () => {
  const originalEnv = process.env.LANGFUSE_USER_ID_FIELD;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.LANGFUSE_USER_ID_FIELD;
    } else {
      process.env.LANGFUSE_USER_ID_FIELD = originalEnv;
    }
  });

  it('returns undefined when user is null', () => {
    expect(getLangfuseUserId(null)).toBeUndefined();
  });

  it('returns undefined when user is undefined', () => {
    expect(getLangfuseUserId(undefined)).toBeUndefined();
  });

  it('defaults to internal id when env var is not set', () => {
    delete process.env.LANGFUSE_USER_ID_FIELD;
    expect(getLangfuseUserId(makeUser())).toBe('mongo-id-123');
  });

  it('defaults to internal id when env var is set to "id"', () => {
    process.env.LANGFUSE_USER_ID_FIELD = 'id';
    expect(getLangfuseUserId(makeUser())).toBe('mongo-id-123');
  });

  it('returns email when LANGFUSE_USER_ID_FIELD=email', () => {
    process.env.LANGFUSE_USER_ID_FIELD = 'email';
    expect(getLangfuseUserId(makeUser())).toBe('alice@example.com');
  });

  it('returns username when LANGFUSE_USER_ID_FIELD=username', () => {
    process.env.LANGFUSE_USER_ID_FIELD = 'username';
    expect(getLangfuseUserId(makeUser())).toBe('alice');
  });

  it('returns name when LANGFUSE_USER_ID_FIELD=name', () => {
    process.env.LANGFUSE_USER_ID_FIELD = 'name';
    expect(getLangfuseUserId(makeUser())).toBe('Alice Smith');
  });

  it('falls back to id when requested field is empty', () => {
    process.env.LANGFUSE_USER_ID_FIELD = 'username';
    expect(getLangfuseUserId(makeUser({ username: '' }))).toBe('mongo-id-123');
  });

  it('falls back to id when requested field is missing from user', () => {
    process.env.LANGFUSE_USER_ID_FIELD = 'username';
    const user = makeUser();
    delete (user as Partial<IUser>).username;
    expect(getLangfuseUserId(user)).toBe('mongo-id-123');
  });

  it('falls back to id for unsupported field names', () => {
    process.env.LANGFUSE_USER_ID_FIELD = 'role';
    expect(getLangfuseUserId(makeUser())).toBe('mongo-id-123');
  });

  it('trims whitespace from env var before comparing', () => {
    process.env.LANGFUSE_USER_ID_FIELD = '  email  ';
    expect(getLangfuseUserId(makeUser())).toBe('alice@example.com');
  });
});
