import React from 'react';
import { render, screen } from '@testing-library/react';
import AskUserQuestionProgress from '../AskUserQuestionProgress';

const translations: Record<string, string> = {
  com_ui_asking: 'Asking',
};

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => translations[key] ?? key,
}));

jest.mock('~/Providers/ChatContext', () => {
  const { createContext } = jest.requireActual<typeof React>('react');
  return {
    ChatContext: createContext({ conversation: { conversationId: 'convo-1' } }),
  };
});

let mockLivePauses: { ids: string[]; hasUnattributed: boolean } = {
  ids: [],
  hasUnattributed: false,
};

jest.mock('~/data-provider', () => ({
  useGetMessagesByConvoId: () => ({ data: mockLivePauses }),
}));

describe('AskUserQuestionProgress', () => {
  beforeEach(() => {
    mockLivePauses = { ids: [], hasUnattributed: false };
  });

  test('streams the question text from partial args', () => {
    render(
      <AskUserQuestionProgress
        args={'{"question":"Which environment should I dep'}
        toolCallId="call_1"
      />,
    );

    expect(screen.getByText('Asking')).toBeInTheDocument();
    expect(screen.getByText('Which environment should I dep')).toBeInTheDocument();
  });

  test('decodes JSON escapes in the streaming question', () => {
    render(
      <AskUserQuestionProgress args={'{"question":"Caf\\u00e9 or \\"bar\\"'} toolCallId="call_1" />,
    );

    expect(screen.getByText('Café or "bar"')).toBeInTheDocument();
  });

  test('renders a skeleton line before any question text streams', () => {
    render(<AskUserQuestionProgress args="" toolCallId="call_1" />);

    expect(screen.getByText('Asking')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  test('hides once the interactive pause for this call is live', () => {
    mockLivePauses = { ids: ['call_1'], hasUnattributed: false };

    const { container } = render(
      <AskUserQuestionProgress args={'{"question":"Ready?"}'} toolCallId="call_1" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  test('hides for an unattributed live pause (no tool_call_id on the payload)', () => {
    mockLivePauses = { ids: [], hasUnattributed: true };

    const { container } = render(
      <AskUserQuestionProgress args={'{"question":"Ready?"}'} toolCallId="call_1" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  test("stays visible while a DIFFERENT call's pause is interactive", () => {
    mockLivePauses = { ids: ['call_1'], hasUnattributed: false };

    render(
      <AskUserQuestionProgress args={'{"question":"Second question?"}'} toolCallId="call_2" />,
    );

    expect(screen.getByText('Second question?')).toBeInTheDocument();
  });

  test('hides when its own pause is live alongside a newer sibling pause', () => {
    mockLivePauses = { ids: ['call_1', 'call_2'], hasUnattributed: false };

    const { container } = render(
      <AskUserQuestionProgress args={'{"question":"First question?"}'} toolCallId="call_1" />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
