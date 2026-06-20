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

  it('renders one removable chip per pending quote', () => {
    renderWithQuotes(['alpha excerpt', 'beta excerpt']);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('alpha excerpt');
    expect(items[1]).toHaveTextContent('beta excerpt');
  });

  it('removes a quote when its × button is clicked', () => {
    renderWithQuotes(['keep me', 'remove me']);
    const removeButtons = screen.getAllByRole('button', { name: /com_ui_remove_quote/ });
    fireEvent.click(removeButtons[1]);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('keep me');
  });
});
