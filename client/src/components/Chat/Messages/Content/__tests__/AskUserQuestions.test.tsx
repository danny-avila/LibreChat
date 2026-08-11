import React from 'react';
import { RecoilRoot } from 'recoil';
import { fireEvent, render, screen } from '@testing-library/react';
import AskUserQuestions from '../AskUserQuestions';

const mockSubmitAskAnswer = jest.fn();

jest.mock('~/components/Chat/Messages/Content/ApprovalContext', () => ({
  useAskSubmitStatus: () => ({ getAskStatus: () => 'idle' }),
  useResumeSubmit: () => ({ submitAskAnswer: mockSubmitAskAnswer }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<number, number>) => {
    const labels: Record<string, string> = {
      com_ui_question_number: `Question ${values?.[0] ?? ''}`,
      com_ui_your_answer: 'Your answer',
      com_ui_skip: 'Skip',
      com_ui_submit: 'Submit',
      com_ui_submitting: 'Submitting',
    };
    return labels[key] ?? key;
  },
}));

const questions = [
  {
    id: 'environment',
    header: 'Environment',
    question: 'Where should this run?',
    options: [
      { label: 'Staging', value: 'staging' },
      { label: 'Production', value: 'production' },
    ],
  },
  { id: 'window', question: 'Which time window?' },
];

describe('AskUserQuestions', () => {
  beforeEach(() => mockSubmitAskAnswer.mockClear());

  test('submits one answer map after every question is complete', () => {
    render(
      <RecoilRoot>
        <AskUserQuestions actionId="ask-batch" questions={questions} />
      </RecoilRoot>,
    );

    const submit = screen.getByRole('button', { name: 'Submit' });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Staging' }));
    fireEvent.change(screen.getByRole('textbox', { name: /Which time window/ }), {
      target: { value: 'Last seven days' },
    });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    expect(mockSubmitAskAnswer).toHaveBeenCalledWith(
      'ask-batch',
      {
        environment: 'staging',
        window: 'Last seven days',
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  test('retains partial answers across surface remounts', () => {
    const view = render(
      <RecoilRoot>
        <AskUserQuestions actionId="ask-remount" questions={questions} />
      </RecoilRoot>,
    );
    fireEvent.change(screen.getByRole('textbox', { name: /Which time window/ }), {
      target: { value: 'Today' },
    });

    view.rerender(
      <RecoilRoot>
        <AskUserQuestions actionId="ask-remount" questions={questions} />
      </RecoilRoot>,
    );

    expect(screen.getByRole('textbox', { name: /Which time window/ })).toHaveValue('Today');
  });

  test('supports question ids inherited by ordinary objects', () => {
    render(
      <RecoilRoot>
        <AskUserQuestions
          actionId="ask-prototype-id"
          questions={[
            {
              id: 'constructor',
              question: 'Continue?',
              options: [{ label: 'Yes', value: 'yes' }],
            },
          ]}
        />
      </RecoilRoot>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(mockSubmitAskAnswer).toHaveBeenCalledWith(
      'ask-prototype-id',
      { constructor: 'yes' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
