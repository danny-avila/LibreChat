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
}));

describe('AskUserQuestionCall', () => {
  const args = JSON.stringify({
    question: 'How would you like me to get the data?',
    options: [{ label: 'Use public data', value: 'public' }],
  });

  test('renders a successful tool result as the user answer', () => {
    render(<AskUserQuestionCall args={args} output="public" />);

    expect(screen.getByText('You answered:')).toBeInTheDocument();
    expect(screen.getByText('Use public data')).toBeInTheDocument();
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
});
