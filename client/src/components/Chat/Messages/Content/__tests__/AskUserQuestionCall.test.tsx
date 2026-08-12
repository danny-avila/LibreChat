import React from 'react';
import { render, screen } from '@testing-library/react';
import AskUserQuestionCall from '../AskUserQuestionCall';

const translations: Record<string, string> = {
  com_ui_asked: 'Asked',
  com_ui_asking: 'Asking',
  com_ui_question_failed: "Question wasn't shown",
  com_ui_question_failed_description:
    "The agent couldn't show this question and may retry automatically.",
  com_ui_question_unanswered: 'No answer was given',
  com_ui_you_answered: 'You answered:',
};

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => translations[key] ?? key,
}));

jest.mock('~/utils/approval', () => ({
  getSubmittedAskAnswer: () => undefined,
  parseAskUserQuestionArgs: (args: string | Record<string, unknown> | undefined) => {
    if (typeof args === 'string') {
      return JSON.parse(args) as Record<string, unknown>;
    }
    return args ?? null;
  },
  parseAskUserQuestionsArgs: (args: string | Record<string, unknown> | undefined) => {
    const parsed = typeof args === 'string' ? JSON.parse(args) : args;
    return Array.isArray(parsed?.questions) ? parsed : null;
  },
}));

jest.mock('../AskUserQuestionProgress', () => ({
  __esModule: true,
  default: () => {
    const { createElement } = jest.requireActual<typeof React>('react');
    return createElement('div', { 'data-testid': 'ask-progress' });
  },
}));

jest.mock('../Container', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => {
    const { createElement } = jest.requireActual<typeof React>('react');
    return createElement('div', null, children);
  },
}));

describe('AskUserQuestionCall', () => {
  const args = JSON.stringify({
    question: 'How would you like me to get the data?',
    options: [{ label: 'Use public data', value: 'public' }],
  });

  test('renders the progress card while the call is live and unanswered', () => {
    render(<AskUserQuestionCall args={args} output="" toolCallId="call_1" isSubmitting />);

    expect(screen.getByTestId('ask-progress')).toBeInTheDocument();
    expect(screen.queryByText('You answered:')).not.toBeInTheDocument();
  });

  test('renders a successful tool result as the user answer', () => {
    render(<AskUserQuestionCall args={args} output="public" />);

    expect(screen.getByText('You answered:')).toBeInTheDocument();
    expect(screen.getByText('Use public data')).toBeInTheDocument();
  });

  test('holds the streaming cursor under the answered card while the resume is in flight', () => {
    const { container } = render(
      <AskUserQuestionCall
        args={args}
        output="public"
        toolCallId="call_1"
        isSubmitting
        showCursor
      />,
    );

    expect(screen.getByText('You answered:')).toBeInTheDocument();
    expect(container.querySelector('.result-thinking')).not.toBeNull();
  });

  test('shows no cursor once the record is not the streaming tail', () => {
    const settled = render(<AskUserQuestionCall args={args} output="public" showCursor />);
    expect(settled.container.querySelector('.result-thinking')).toBeNull();

    const midStream = render(
      <AskUserQuestionCall args={args} output="public" toolCallId="call_1" isSubmitting />,
    );
    expect(midStream.container.querySelector('.result-thinking')).toBeNull();
  });

  test('renders schema rejection as an internal question failure, not a user answer', () => {
    const output =
      'Error processing tool: Received tool input did not match expected schema ' +
      '✖ String must contain at most 120 character(s) → at options[0].label';

    render(<AskUserQuestionCall args={args} output={output} failed />);

    expect(screen.getByText("Question wasn't shown")).toBeInTheDocument();
    expect(
      screen.getByText("The agent couldn't show this question and may retry automatically."),
    ).toBeInTheDocument();
    expect(screen.queryByText('You answered:')).not.toBeInTheDocument();
    expect(screen.queryByText(/Received tool input did not match expected schema/)).toBeNull();
  });

  test('preserves a user answer that contains the complete schema error text', () => {
    const output =
      'Error processing tool: Received tool input did not match expected schema ' +
      '✖ String must contain at most 120 character(s) → at options[0].label';

    render(<AskUserQuestionCall args={args} output={output} />);

    expect(screen.getByText('You answered:')).toBeInTheDocument();
    expect(screen.getByText(output)).toBeInTheDocument();
    expect(screen.queryByText("Question wasn't shown")).not.toBeInTheDocument();
  });

  test('renders each question and answer from one completed batch', () => {
    render(
      <AskUserQuestionCall
        args={JSON.stringify({
          questions: [
            {
              id: 'environment',
              header: 'Environment',
              question: 'Where should this run?',
              description: 'Choose the deployment target.',
              options: [{ label: 'Staging', value: 'staging' }],
            },
            { id: 'window', question: 'Which window?' },
          ],
        })}
        output={JSON.stringify({ answers: { environment: 'staging', window: '7d' } })}
      />,
    );

    expect(screen.getByText('Environment')).toBeInTheDocument();
    expect(screen.getByText('Where should this run?')).toBeInTheDocument();
    expect(screen.getByText('Choose the deployment target.')).toBeInTheDocument();
    expect(screen.getByText('Staging')).toBeInTheDocument();
    expect(screen.getByText('Which window?')).toBeInTheDocument();
    expect(screen.getByText('7d')).toBeInTheDocument();
  });

  test('renders a failed batch without implying the user declined to answer', () => {
    render(
      <AskUserQuestionCall
        args={{ questions: [{ id: 'environment', question: 'Where should this run?' }] }}
        output="Error processing tool"
        failed
      />,
    );

    expect(screen.getByText("Question wasn't shown")).toBeInTheDocument();
    expect(
      screen.getByText("The agent couldn't show this question and may retry automatically."),
    ).toBeInTheDocument();
    expect(screen.queryByText('No answer was given')).not.toBeInTheDocument();
  });
});
