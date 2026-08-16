import { snapshot_UNSTABLE } from 'recoil';
import { atomWithLocalStorage } from '../utils';

/**
 * The helper now normalizes the default when nothing is persisted, not only a
 * saved value. That reaches every atom built with it, so the cases that matter
 * are the ones where a normalizer exists and could change an untouched default.
 */
describe('atomWithLocalStorage default normalization', () => {
  beforeEach(() => localStorage.clear());

  const read = <T>(atom: ReturnType<typeof atomWithLocalStorage<T>>) =>
    snapshot_UNSTABLE().getLoadable(atom).valueOrThrow();

  it('leaves the default alone without a normalizer', () => {
    expect(read(atomWithLocalStorage('plain-default', 'kept'))).toBe('kept');
  });

  it('leaves the default alone when the normalizer accepts it', () => {
    /** The shape the speech-engine atoms have: valid defaults pass through. */
    const atom = atomWithLocalStorage('idempotent-default', 'browser', (engine) =>
      engine === 'browser' ? engine : 'browser',
    );

    expect(read(atom)).toBe('browser');
  });

  it('corrects a default the normalizer rejects', () => {
    const atom = atomWithLocalStorage('rejected-default', 'legacy', (engine) =>
      engine === 'legacy' ? 'external' : engine,
    );

    expect(read(atom)).toBe('external');
  });

  it('still normalizes a persisted value', () => {
    localStorage.setItem('persisted-value', JSON.stringify('legacy'));
    const atom = atomWithLocalStorage('persisted-value', 'browser', (engine) =>
      engine === 'legacy' ? 'external' : engine,
    );

    expect(read(atom)).toBe('external');
  });
});
