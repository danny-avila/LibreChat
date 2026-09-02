import '@testing-library/jest-dom/extend-expect';
import { Provider } from 'jotai';
import { ContentTypes } from 'librechat-data-provider';
import { render, screen } from '@testing-library/react';
import Summary from './Summary';

jest.mock('~/Providers', () => ({
  useMessageContext: () => ({ isSubmitting: false, isLatestMessage: false }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

const content = [{ type: ContentTypes.TEXT, text: 'Persisted summary' }];

const renderSummary = (initiatedBy?: 'user') => {
  const props = {
    content,
    initiatedBy,
  } as React.ComponentProps<typeof Summary> & { initiatedBy?: 'user' };

  return render(
    <Provider>
      <Summary {...props} />
    </Provider>,
  );
};

describe('Summary', () => {
  it('persistently identifies a user-requested compaction', () => {
    renderSummary('user');

    expect(
      screen.getByRole('button', { name: 'com_ui_context_compacted_by_you' }),
    ).toBeInTheDocument();
  });

  it('keeps the automatic summary label when no initiator is stored', () => {
    renderSummary();

    expect(
      screen.getByRole('button', { name: 'com_ui_conversation_summarized' }),
    ).toBeInTheDocument();
  });
});
