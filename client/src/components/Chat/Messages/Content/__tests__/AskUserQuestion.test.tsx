import React from 'react';
import { RecoilRoot } from 'recoil';
import { fireEvent, render, screen } from '@testing-library/react';
import ApprovalProvider from '../ApprovalContext';
import AskUserQuestion from '../AskUserQuestion';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => {
    const labels: Record<string, string> = {
      com_ui_your_answer: 'Your answer',
      com_ui_submit: 'Submit',
      com_ui_submitting: 'Submitting',
    };
    return labels[key] ?? key;
  },
}));

jest.mock('~/hooks/Input/useAskAnswerMode', () => ({
  __esModule: true,
  default: () => ({
    popoverVisible: false,
    collapsed: false,
    expand: jest.fn(),
    liveAsk: null,
    checked: [],
    toggleChecked: jest.fn(),
    submitOption: jest.fn(),
    submitAnswer: jest.fn(),
  }),
}));

jest.mock('~/data-provider', () => ({
  useSubmitToolApprovalMutation: () => ({ mutate: jest.fn() }),
  useSubmitAskAnswerMutation: () => ({ mutate: jest.fn() }),
}));

jest.mock('~/store/agents', () => ({
  useGetEphemeralAgent: () => () => undefined,
}));

jest.mock('~/Providers/ChatContext', () => ({
  ChatContext: jest.requireActual('react').createContext(null),
}));

const tree = (key: string) => (
  <RecoilRoot>
    <ApprovalProvider>
      <AskUserQuestion key={key} actionId="ask-1" question={{ question: 'Which environment?' }} />
    </ApprovalProvider>
  </RecoilRoot>
);

describe('AskUserQuestion', () => {
  test('restores a typed answer after the card remounts inside the same message', () => {
    const view = render(tree('direct'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Your answer' }), {
      target: { value: 'Use staging first' },
    });

    view.rerender(tree('phase-slice'));

    expect(screen.getByRole('textbox', { name: 'Your answer' })).toHaveValue('Use staging first');
  });
});
