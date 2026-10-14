import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import {
  ActivePanelProvider,
  resolveActivePanel,
  useActivePanel,
} from '~/Providers/ActivePanelContext';

const STORAGE_KEY = 'side:active-panel';

function TestConsumer() {
  const { active, setActive } = useActivePanel();
  return (
    <div>
      <span data-testid="active">{active}</span>
      <button data-testid="switch-btn" onClick={() => setActive('bookmarks')} />
    </div>
  );
}

/** jsdom has no Navigation Timing, so the entry type is supplied as an own property. */
const mockNavigationType = (type: NavigationTimingType) =>
  Object.defineProperty(performance, 'getEntriesByType', {
    configurable: true,
    value: () => [{ type }],
  });

describe('ActivePanelContext', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    Reflect.deleteProperty(performance, 'getEntriesByType');
  });

  const renderProvider = () =>
    render(
      <ActivePanelProvider>
        <TestConsumer />
      </ActivePanelProvider>,
    );

  it('lands a first visit on conversations', () => {
    renderProvider();
    expect(screen.getByTestId('active')).toHaveTextContent('conversations');
  });

  it('lands a returning visit on conversations instead of the last persisted panel', () => {
    localStorage.setItem(STORAGE_KEY, 'skills');
    renderProvider();
    expect(screen.getByTestId('active')).toHaveTextContent('conversations');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('restores the panel chosen earlier in the same tab on reload', () => {
    mockNavigationType('reload');
    sessionStorage.setItem(STORAGE_KEY, 'memories');
    renderProvider();
    expect(screen.getByTestId('active')).toHaveTextContent('memories');
  });

  it.each<NavigationTimingType>(['navigate', 'back_forward'])(
    'lands a %s entry on conversations even when session storage carries a panel',
    (type) => {
      mockNavigationType(type);
      sessionStorage.setItem(STORAGE_KEY, 'skills');
      renderProvider();
      expect(screen.getByTestId('active')).toHaveTextContent('conversations');
      expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    },
  );

  it('setActive updates state and keeps it for the session only', () => {
    renderProvider();
    fireEvent.click(screen.getByTestId('switch-btn'));
    expect(screen.getByTestId('active')).toHaveTextContent('bookmarks');
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe('bookmarks');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('throws when useActivePanel is called outside provider', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow(
      'useActivePanel must be used within an ActivePanelProvider',
    );
    spy.mockRestore();
  });
});

describe('resolveActivePanel', () => {
  const links = [{ id: 'conversations' }, { id: 'prompts' }, { id: 'files' }];

  it('returns active when it matches a link', () => {
    expect(resolveActivePanel('prompts', links)).toBe('prompts');
  });

  it('falls back to first link when active does not match', () => {
    expect(resolveActivePanel('hide-panel', links)).toBe('conversations');
  });

  it('returns active unchanged when links is empty', () => {
    expect(resolveActivePanel('agents', [])).toBe('agents');
  });

  it('falls back to the only link when active is stale', () => {
    expect(resolveActivePanel('agents', [{ id: 'conversations' }])).toBe('conversations');
  });
});
