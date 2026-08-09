import React, { createRef } from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import type { SettingDefinition, TConversation } from 'librechat-data-provider';
import Thinking from '../Thinking';

const mockSetValue = jest.fn();
const mockSetOption = jest.fn(() => mockSetValue);
const mockSetting = {
  key: 'reasoning_effort',
  default: 'low',
  options: ['auto', 'low', 'high'],
} as SettingDefinition;

jest.mock('~/hooks/Input/useThinkingSetting', () => ({
  __esModule: true,
  default: () => mockSetting,
}));

jest.mock('~/hooks/Generic/useReducedMotion', () => ({
  __esModule: true,
  default: () => true,
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, options?: Record<string, string | number>) =>
    options ? `${key}:${options['0'] ?? options.count}` : key,
  useSetIndexOptions: () => ({ setOption: mockSetOption }),
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: { interface: { parameters: true } } }),
}));

jest.mock('~/Providers', () => ({
  useChatContext: () => ({
    conversation: {
      conversationId: 'convo-1',
      reasoning_effort: 'low',
    } as TConversation,
  }),
}));

function renderInComposer() {
  const textareaRef = createRef<HTMLTextAreaElement>();
  const onComposerClick = jest.fn(() => textareaRef.current?.focus());
  render(
    <div onClick={onComposerClick}>
      <textarea ref={textareaRef} aria-label="Message input" />
      <Thinking />
    </div>,
  );
  return { onComposerClick };
}

describe('Thinking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps keyboard activation inside the control and moves focus into the effort radios', async () => {
    const user = userEvent.setup();
    const { onComposerClick } = renderInComposer();
    const disclosure = screen.getByTestId('composer-thinking-button');

    disclosure.focus();
    await user.keyboard('{Enter}');

    expect(onComposerClick).not.toHaveBeenCalled();
    expect(screen.getByRole('radiogroup')).toBeVisible();
    expect(screen.getByRole('radio', { name: 'Low' })).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'High' })).toHaveFocus();
  });

  it('keeps effort selection clicks from reaching the composer focus handler', async () => {
    const user = userEvent.setup();
    const { onComposerClick } = renderInComposer();

    await user.click(screen.getByTestId('composer-thinking-button'));
    onComposerClick.mockClear();
    await user.click(screen.getByRole('radio', { name: 'High' }));

    expect(mockSetValue).toHaveBeenCalledWith('high');
    expect(onComposerClick).not.toHaveBeenCalled();
  });
});
