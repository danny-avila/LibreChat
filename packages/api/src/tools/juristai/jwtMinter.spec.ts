import jwt from 'jsonwebtoken';
import { mintChatJwt, clearChatJwtCache } from './jwtMinter';

const SECRET = 'unit-test-chat-secret';

describe('mintChatJwt', () => {
  const originalSecret = process.env.CHAT_SECRET;
  const originalExpiry = process.env.CHAT_TOKEN_EXPIRY_SECONDS;

  beforeEach(() => {
    process.env.CHAT_SECRET = SECRET;
    process.env.CHAT_TOKEN_EXPIRY_SECONDS = '300';
    clearChatJwtCache();
  });

  afterAll(() => {
    process.env.CHAT_SECRET = originalSecret;
    process.env.CHAT_TOKEN_EXPIRY_SECONDS = originalExpiry;
    clearChatJwtCache();
  });

  it('signs the claim shape django-hub expects', () => {
    const token = mintChatJwt({ id: '507f1f77bcf86cd799439011', email: 'user@example.com' });
    const decoded = jwt.verify(token, SECRET, { issuer: 'librechat' }) as jwt.JwtPayload;

    expect(decoded.sub).toBe('507f1f77bcf86cd799439011');
    expect(decoded.email).toBe('user@example.com');
    expect(decoded.iss).toBe('librechat');
    expect(typeof decoded.exp).toBe('number');
  });

  it('omits email when not provided', () => {
    const token = mintChatJwt({ id: 'abc' });
    const decoded = jwt.decode(token) as jwt.JwtPayload;
    expect(decoded.email).toBeUndefined();
    expect(decoded.sub).toBe('abc');
  });

  it('reuses a cached token for the same user', () => {
    const first = mintChatJwt({ id: 'abc', email: 'a@b.com' });
    const second = mintChatJwt({ id: 'abc', email: 'a@b.com' });
    expect(second).toBe(first);
  });

  it('issues distinct tokens for different users', () => {
    const a = mintChatJwt({ id: 'user-a', email: 'a@b.com' });
    const b = mintChatJwt({ id: 'user-b', email: 'b@b.com' });
    expect(a).not.toBe(b);
  });

  it('throws when CHAT_SECRET is not configured', () => {
    process.env.CHAT_SECRET = '';
    clearChatJwtCache();
    expect(() => mintChatJwt({ id: 'abc' })).toThrow(/CHAT_SECRET/);
  });

  it('produces a token Django would reject under the wrong secret', () => {
    const token = mintChatJwt({ id: 'abc' });
    expect(() => jwt.verify(token, 'a-different-secret')).toThrow();
  });
});
