import React from 'react';
import { RecoilRoot } from 'recoil';
import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, params?: Record<string, unknown>) =>
    `${key}:${params?.[0] ?? ''}`,
}));

import store from '~/store';
import PendingQuoteChips from '../PendingQuoteChips';

const CONVO_ID = 'convo-1';

const renderWithQuotes = (quotes: string[]) =>
  render(
    <RecoilRoot initializeState={({ set }) => set(store.pendingQuotesByConvoId(CONVO_ID), quotes)}>
      <PendingQuoteChips conversationId={CONVO_ID} />
    </RecoilRoot>,
  );

describe('PendingQuoteChips', () => {
  it('renders nothing when there are no pending quotes', () => {
    const { container } = renderWithQuotes([]);
    expect(container.firstChild).toBeNull();
  });

  it('shows the excerpt text for a single selection', () => {
    renderWithQuotes(['alpha excerpt']);
    const chips = screen.getByTestId('pending-quote-chips');
    expect(chips).toHaveAttribute('data-quote-count', '1');
    expect(chips).toHaveTextContent('alpha excerpt');
  });

  it('collapses multiple selections into a single "{n} selections" chip', () => {
    renderWithQuotes(['alpha excerpt', 'beta excerpt']);
    const chips = screen.getByTestId('pending-quote-chips');
    expect(chips).toHaveAttribute('data-quote-count', '2');
    // Collapsed label (the localize mock renders "<key>:<count>").
    expect(chips).toHaveTextContent('com_ui_quote_selections:2');
    // The composer shows ONE chip, not a row of two (the per-excerpt list lives
    // in the hover popup, which only mounts on hover).
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('removes the single selection when its × is clicked', () => {
    const { container } = renderWithQuotes(['only one']);
    fireEvent.click(screen.getByRole('button', { name: /com_ui_remove_quote/ }));
    expect(container.firstChild).toBeNull();
  });

  it('clears all selections from the collapsed chip', () => {
    const { container } = renderWithQuotes(['first', 'second']);
    fireEvent.click(screen.getByRole('button', { name: /com_ui_remove_all_quotes/ }));
    expect(container.firstChild).toBeNull();
  });
});
