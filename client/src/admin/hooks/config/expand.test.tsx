import { useState } from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { RowFilterContext } from '~/admin/contexts/RowFilterContext';
import { useExpandableState, useExpandRequest } from './expand';
import { ExpandProvider } from '~/admin/contexts/ExpandContext';
import { createPathIndex } from '~/admin/utils';

function Collapsible({ id, defaultExpanded = false }: { id: string; defaultExpanded?: boolean }) {
  const [isExpanded, setIsExpanded] = useExpandableState(defaultExpanded);
  return (
    <button type="button" data-testid={id} onClick={() => setIsExpanded((v) => !v)}>
      {isExpanded ? 'open' : 'closed'}
    </button>
  );
}

function Toolbar() {
  const request = useExpandRequest();
  return (
    <>
      <button type="button" onClick={() => request('expand')}>
        {'expand all'}
      </button>
      <button type="button" onClick={() => request('collapse')}>
        {'collapse all'}
      </button>
    </>
  );
}

function Page({ resetKey = 'a' }: { resetKey?: string }) {
  const [showLate, setShowLate] = useState(false);
  return (
    <ExpandProvider resetKey={resetKey}>
      <Toolbar />
      <Collapsible id="first" />
      <Collapsible id="second" defaultExpanded />
      <button type="button" onClick={() => setShowLate(true)}>
        {'mount late'}
      </button>
      {showLate && <Collapsible id="late" />}
    </ExpandProvider>
  );
}

const state = (id: string) => screen.getByTestId(id).textContent;

function Revealed({ id, defaultExpanded = false }: { id: string; defaultExpanded?: boolean }) {
  const [isExpanded] = useExpandableState(defaultExpanded, ['a.b']);
  return <span data-testid={id}>{isExpanded ? 'open' : 'closed'}</span>;
}

function Filtered({ query }: { query: string | null }) {
  return (
    <RowFilterContext.Provider value={query ? createPathIndex([query]) : null}>
      <Revealed id="closed-before" />
      <Revealed id="open-before" defaultExpanded />
    </RowFilterContext.Provider>
  );
}

describe('useExpandableState', () => {
  it('starts from defaultExpanded and keeps manual toggles', () => {
    render(<Page />);
    expect(state('first')).toBe('closed');
    expect(state('second')).toBe('open');
    fireEvent.click(screen.getByTestId('first'));
    expect(state('first')).toBe('open');
  });

  it('opens and closes every collapsible on Expand all / Collapse all', () => {
    render(<Page />);
    fireEvent.click(screen.getByText('expand all'));
    expect([state('first'), state('second')]).toEqual(['open', 'open']);
    fireEvent.click(screen.getByText('collapse all'));
    expect([state('first'), state('second')]).toEqual(['closed', 'closed']);
  });

  it('opens collapsibles that mount after an Expand all (lazily rendered children)', () => {
    render(<Page />);
    fireEvent.click(screen.getByText('expand all'));
    fireEvent.click(screen.getByText('mount late'));
    expect(state('late')).toBe('open');
  });

  it('forgets the last request when the reset key changes', () => {
    const { rerender } = render(<Page resetKey="a" />);
    fireEvent.click(screen.getByText('expand all'));
    act(() => rerender(<Page resetKey="b" />));
    fireEvent.click(screen.getByText('mount late'));
    expect(state('late')).toBe('closed');
    expect(state('first')).toBe('open');
  });

  it('works without a provider (stays local)', () => {
    render(<Collapsible id="solo" />);
    fireEvent.click(screen.getByTestId('solo'));
    expect(state('solo')).toBe('open');
  });

  it('opens for a filter match and goes back to how it was once the filter is cleared', () => {
    const { rerender } = render(<Filtered query={null} />);
    expect([state('closed-before'), state('open-before')]).toEqual(['closed', 'open']);
    rerender(<Filtered query="a.b.c" />);
    expect([state('closed-before'), state('open-before')]).toEqual(['open', 'open']);
    rerender(<Filtered query={null} />);
    expect([state('closed-before'), state('open-before')]).toEqual(['closed', 'open']);
  });
});
