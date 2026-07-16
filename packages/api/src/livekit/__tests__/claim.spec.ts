import { isWorkerSecretValid } from '../claim';

const SECRET = 'a-real-worker-secret';

describe('isWorkerSecretValid', () => {
  it('accepts the exact secret', () => {
    expect(isWorkerSecretValid(SECRET, SECRET)).toBe(true);
  });

  it('rejects a wrong secret of the same length', () => {
    expect(isWorkerSecretValid('a-real-worker-secrez', SECRET)).toBe(false);
  });

  it('rejects a prefix, so a partial match cannot pass', () => {
    expect(isWorkerSecretValid('a-real', SECRET)).toBe(false);
  });

  it('rejects differing lengths without throwing', () => {
    expect(() => isWorkerSecretValid(`${SECRET}-extra`, SECRET)).not.toThrow();
    expect(isWorkerSecretValid(`${SECRET}-extra`, SECRET)).toBe(false);
  });

  it('rejects empty and non-string input', () => {
    expect(isWorkerSecretValid('', SECRET)).toBe(false);
    expect(isWorkerSecretValid(undefined, SECRET)).toBe(false);
    expect(isWorkerSecretValid(null, SECRET)).toBe(false);
    expect(isWorkerSecretValid(['a'], SECRET)).toBe(false);
    expect(isWorkerSecretValid(42, SECRET)).toBe(false);
  });

  it('is case sensitive', () => {
    expect(isWorkerSecretValid(SECRET.toUpperCase(), SECRET)).toBe(false);
  });
});
