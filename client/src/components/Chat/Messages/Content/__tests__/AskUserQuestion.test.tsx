import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AskUserQuestion from '../AskUserQuestion';

const mockSubmitAnswer = jest.fn();
const mockSetAnswerText = jest.fn();

jest.mock('@librechat/client', () => ({
  Button: ({
    children,
    size: _size,
    variant: _variant,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { size?: string; variant?: string }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  TextareaAutosize: ({
    minRows: _minRows,
    maxRows: _maxRows,
    ...props
  }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    minRows?: number;
    maxRows?: number;
  }) => <textarea {...props} />,
  TooltipAnchor: ({ render }: { render: React.ReactNode }) => render,
}));

jest.mock('lucide-react', () => ({
  ChevronUp: () => <span />,
  MessageCircleQuestion: () => <span />,
  TriangleAlert: () => <span />,
}));

jest.mock('../ApprovalContext', () => ({
  useAskSubmitStatus: () => ({ getAskStatus: () => 'idle' }),
  useResumeSubmit: () => ({ submitAskAnswer: jest.fn() }),
}));

jest.mock('~/hooks/Input/useAskAnswerMode', () => ({
  __esModule: true,
  default: () => ({
    popoverVisible: false,
    collapsed: true,
    expand: jest.fn(),
    liveAsk: { actionId: 'action-1' },
    checked: [0],
    toggleChecked: jest.fn(),
    submitOption: jest.fn(),
    submitAnswer: mockSubmitAnswer,
    answerText: 'carried free-form answer',
    setAnswerText: mockSetAnswerText,
  }),
}));

jest.mock('~/components/Chat/ask/options', () => ({
  __esModule: true,
  default: () => <div data-testid="ask-options" />,
}));

jest.mock('~/Providers/ChatContext', () => {
  const ReactModule = jest.requireActual<typeof React>('react');
  return {
    ChatContext: ReactModule.createContext({
      conversation: { conversationId: 'conversation-1' },
    }),
  };
});

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => {
    const translations: Record<string, string> = {
      com_ui_your_answer: 'Your answer',
      com_ui_skip: 'Skip',
      com_ui_submit: 'Submit',
    };
    return translations[key] ?? key;
  },
}));

jest.mock('~/utils', () => ({
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
}));

jest.mock('~/utils/approval', () => ({
  ASK_USER_DECLINED_ANSWER: 'User declined to answer',
  splitOtherOption: (options?: Array<{ label: string; value: string }>) => ({
    choices: options ?? [],
    otherLabel: undefined,
  }),
}));

describe('AskUserQuestion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('submits checked options together with free text carried from the composer', () => {
    render(
      <AskUserQuestion
        actionId="action-1"
        question={{
          question: 'Choose a source',
          multiSelect: true,
          options: [{ label: 'Public data', value: 'public' }],
        }}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Your answer' })).toHaveValue(
      'carried free-form answer',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(mockSubmitAnswer).toHaveBeenCalledWith(['public', 'carried free-form answer']);
  });
});
