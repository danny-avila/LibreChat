import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import { ActivePanelProvider, useActivePanel } from '~/Providers/ActivePanelContext';

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

describe('ActivePanelContext', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to conversations when no localStorage value exists', () => {
    render(
      <ActivePanelProvider>
        <TestConsumer />
      </ActivePanelProvider>,
    );
    expect(screen.getByTestId('active')).toHaveTextContent('conversations');
  });

  it('reads initial value from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'memories');
    render(
      <ActivePanelProvider>
        <TestConsumer />
      </ActivePanelProvider>,
    );
    expect(screen.getByTestId('active')).toHaveTextContent('memories');
  });

  it('setActive updates state and writes to localStorage', () => {
    render(
      <ActivePanelProvider>
        <TestConsumer />
      </ActivePanelProvider>,
    );
    fireEvent.click(screen.getByTestId('switch-btn'));
    expect(screen.getByTestId('active')).toHaveTextContent('bookmarks');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('bookmarks');
  });

  it('throws when useActivePanel is called outside provider', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow(
      'useActivePanel must be used within an ActivePanelProvider',
    );
    spy.mockRestore();
  });
});
