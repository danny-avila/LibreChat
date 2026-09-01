import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { unseenTabBadgeAtom } from '../replyNotificationSettings';
import useUnseenBadge from '../useUnseenBadge';

function mountIcons() {
  const icon32 = document.createElement('link');
  icon32.rel = 'icon';
  icon32.setAttribute('sizes', '32x32');
  icon32.href = 'assets/favicon-32x32.png';
  const icon16 = document.createElement('link');
  icon16.rel = 'icon';
  icon16.setAttribute('sizes', '16x16');
  icon16.href = 'assets/favicon-16x16.png';
  document.head.append(icon32, icon16);
  return { icon32, icon16 };
}

function mount(count: number, badgeEnabled = true) {
  const settings = createStore();
  settings.set(unseenTabBadgeAtom, badgeEnabled);
  return renderHook((nextCount: number) => useUnseenBadge(nextCount), {
    initialProps: count,
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <JotaiProvider store={settings}>{children}</JotaiProvider>
    ),
  });
}

describe('useUnseenBadge', () => {
  let icons: ReturnType<typeof mountIcons>;

  beforeEach(() => {
    document.title = 'LibreChat';
    icons = mountIcons();
  });

  afterEach(() => {
    icons.icon32.remove();
    icons.icon16.remove();
  });

  it('records the original href of every icon so each can be badged and restored', () => {
    mount(2);

    /* Firefox and 1x-DPI Chrome pick the 16x16 icon; badging only the 32x32 link
       leaves those browsers without a badge. `link.href` is the resolved original. */
    expect(icons.icon32.dataset.originalHref).toBe(icons.icon32.href);
    expect(icons.icon16.dataset.originalHref).toBe(icons.icon16.href);
  });

  it('prefixes the title with the count and restores it at zero', () => {
    const { rerender } = mount(3);

    expect(document.title).toBe('(3) LibreChat');

    rerender(0);

    expect(document.title).toBe('LibreChat');
  });

  it('leaves a conversation title that legitimately starts with a count alone', () => {
    document.title = '(3) Notes';

    mount(0);

    expect(document.title).toBe('(3) Notes');
  });

  it('does not swallow a rename whose title starts with the active badge', async () => {
    /* Three unread and a conversation genuinely called "(3) Notes": matching on the prefix
       alone would mistake the user's own text for the badge and strip it later. */
    const { rerender } = mount(3);

    document.title = '(3) Notes';

    await waitFor(() => expect(document.title).toBe('(3) (3) Notes'));

    rerender(0);

    await waitFor(() => expect(document.title).toBe('(3) Notes'));
  });

  it('recomposes when another writer changes the title', async () => {
    const { rerender } = mount(1);

    document.title = 'Renamed Conversation';

    await waitFor(() => expect(document.title).toBe('(1) Renamed Conversation'));

    rerender(0);

    await waitFor(() => expect(document.title).toBe('Renamed Conversation'));
  });

  it('leaves the title and icons alone while the setting is off', async () => {
    mount(3, false);

    await waitFor(() => expect(document.title).toBe('LibreChat'));
    expect(icons.icon32.href).toContain('assets/favicon-32x32.png');
  });
});
