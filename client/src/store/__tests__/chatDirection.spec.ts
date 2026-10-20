const DIRECTION_KEY = 'chatDirection';

const readStoredDirection = async (): Promise<string> => {
  const { snapshot_UNSTABLE } = await import('recoil');
  const settings = await import('../settings');
  return snapshot_UNSTABLE().getLoadable(settings.default.chatDirection).valueOrThrow();
};

describe('chatDirection', () => {
  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
  });

  it('defaults to auto so typed text resolves its own direction', async () => {
    expect(await readStoredDirection()).toBe('auto');
  });

  it.each([
    ['LTR', 'ltr'],
    ['RTL', 'rtl'],
    ['rtl', 'rtl'],
  ])('keeps a stored %s choice as %s', async (stored, expected) => {
    localStorage.setItem(DIRECTION_KEY, JSON.stringify(stored));
    expect(await readStoredDirection()).toBe(expected);
    expect(localStorage.getItem(DIRECTION_KEY)).toBe(JSON.stringify(expected));
  });

  it('falls back to auto for an unrecognized stored value', async () => {
    localStorage.setItem(DIRECTION_KEY, JSON.stringify('sideways'));
    expect(await readStoredDirection()).toBe('auto');
  });
});
