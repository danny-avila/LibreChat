import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import type { TMessage } from 'librechat-data-provider';
import ToolCallLimitNotice from '../ToolCallLimitNotice';
import { ChatContext } from '~/Providers/ChatContext';

const TRANSLATIONS: Record<string, string> = {
  com_ui_tool_call_limit_title: 'Reached the tool call limit for this turn',
  com_ui_tool_call_limit_body: 'The agent used every step allowed in a single turn.',
  com_ui_tool_call_limit_continue: 'Keep going',
  com_ui_tool_call_limit_continue_prompt: 'Keep going from where you stopped.',
  com_ui_tool_call_limit_answer: 'Answer now',
  com_ui_tool_call_limit_answer_prompt: 'Stop using tools and answer now.',
  com_ui_dismiss: 'Dismiss',
};

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => TRANSLATIONS[key] ?? key,
}));

const MESSAGE = { messageId: 'response-1' } as TMessage;

/**
 * Only the fields the notice reads. The real context is far larger, so this is
 * cast once at the seam rather than reconstructed.
 */
function renderNotice(
  context?: { ask?: jest.Mock; isSubmitting?: boolean; latestMessageId?: string },
  message: TMessage = MESSAGE,
) {
  if (!context) {
    return render(<ToolCallLimitNotice message={message} />);
  }
  const value = context as unknown as React.ContextType<typeof ChatContext>;
  return render(
    <ChatContext.Provider value={value}>
      <ToolCallLimitNotice message={message} />
    </ChatContext.Provider>,
  );
}

describe('ToolCallLimitNotice', () => {
  it('explains what happened rather than reporting an error', () => {
    renderNotice();

    expect(screen.getByText(TRANSLATIONS.com_ui_tool_call_limit_title)).toBeInTheDocument();
    expect(screen.getByText(TRANSLATIONS.com_ui_tool_call_limit_body)).toBeInTheDocument();
    /** An `alert` role would announce this as a failure; it is a normal outcome. */
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('names its container for screen readers', () => {
    renderNotice();

    expect(
      screen.getByRole('group', { name: TRANSLATIONS.com_ui_tool_call_limit_title }),
    ).toBeInTheDocument();
  });

  it('continues the turn as a new request carrying the continue instruction', () => {
    const ask = jest.fn();
    renderNotice({ ask, isSubmitting: false, latestMessageId: 'response-1' });

    fireEvent.click(
      screen.getByRole('button', { name: TRANSLATIONS.com_ui_tool_call_limit_continue }),
    );

    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith({
      text: TRANSLATIONS.com_ui_tool_call_limit_continue_prompt,
    });
  });

  it('asks for an immediate answer instead of more tool use', () => {
    const ask = jest.fn();
    renderNotice({ ask, isSubmitting: false, latestMessageId: 'response-1' });

    fireEvent.click(
      screen.getByRole('button', { name: TRANSLATIONS.com_ui_tool_call_limit_answer }),
    );

    expect(ask).toHaveBeenCalledWith({
      text: TRANSLATIONS.com_ui_tool_call_limit_answer_prompt,
    });
  });

  it('offers no actions with no live chat behind it, as in a shared link or export', () => {
    renderNotice();

    expect(
      screen.queryByRole('button', { name: TRANSLATIONS.com_ui_tool_call_limit_continue }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: TRANSLATIONS.com_ui_tool_call_limit_answer }),
    ).not.toBeInTheDocument();
    /** The explanation and the way to hide it must survive. */
    expect(screen.getByText(TRANSLATIONS.com_ui_tool_call_limit_body)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
  });

  it('offers no actions on a message that is not the branch tail', () => {
    const ask = jest.fn();
    renderNotice({ ask, isSubmitting: false, latestMessageId: 'some-newer-message' });

    expect(
      screen.queryByRole('button', { name: TRANSLATIONS.com_ui_tool_call_limit_continue }),
    ).not.toBeInTheDocument();
    expect(ask).not.toHaveBeenCalled();
  });

  it('offers no actions while a generation is already running', () => {
    renderNotice({ ask: jest.fn(), isSubmitting: true, latestMessageId: 'response-1' });

    expect(
      screen.queryByRole('button', { name: TRANSLATIONS.com_ui_tool_call_limit_continue }),
    ).not.toBeInTheDocument();
  });

  it('can be dismissed', () => {
    renderNotice({ ask: jest.fn(), isSubmitting: false, latestMessageId: 'response-1' });

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByText(TRANSLATIONS.com_ui_tool_call_limit_title)).not.toBeInTheDocument();
  });
});
