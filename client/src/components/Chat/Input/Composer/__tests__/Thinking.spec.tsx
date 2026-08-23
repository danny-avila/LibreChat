import React, { createRef } from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import type { SettingDefinition, TConversation } from 'librechat-data-provider';
import Thinking from '../Thinking';

const mockSetValue = jest.fn();
const mockSetOption = jest.fn(() => mockSetValue);
let mockSetting = {
  key: 'reasoning_effort',
  default: 'low',
  options: ['auto', 'low', 'high'],
} as SettingDefinition;
let mockConversation = {
  conversationId: 'convo-1',
  reasoning_effort: 'low',
} as TConversation;
const mockChatContext = React.createContext<{ conversation: TConversation | null }>({
  conversation: mockConversation,
});

jest.mock('~/hooks/Input/useThinkingSetting', () => ({
  __esModule: true,
  default: () => mockSetting,
}));

jest.mock('~/hooks/Generic/useReducedMotion', () => ({
  __esModule: true,
  default: () => true,
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, options?: Record<string, string | number>) => {
    if (options) {
      return `${key}:${options['0'] ?? options.count}`;
    }
    return (
      (
        {
          com_ui_auto: 'Auto',
          com_ui_off: 'Off',
          com_ui_low: 'Low',
          com_ui_medium: 'Medium',
          com_ui_high: 'High',
        } as Record<string, string>
      )[key] ?? key
    );
  },
  useSetIndexOptions: () => ({ setOption: mockSetOption }),
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: { interface: { parameters: true } } }),
}));

jest.mock('~/Providers', () => ({
  useChatContext: () =>
    jest.requireActual<typeof import('react')>('react').useContext(mockChatContext),
}));

function renderInComposer() {
  const textareaRef = createRef<HTMLTextAreaElement>();
  const onComposerClick = jest.fn(() => textareaRef.current?.focus());
  const tree = () => (
    <mockChatContext.Provider value={{ conversation: mockConversation }}>
      <div onClick={onComposerClick}>
        <textarea ref={textareaRef} aria-label="Message input" />
        <Thinking />
      </div>
    </mockChatContext.Provider>
  );
  const view = render(tree());
  return { ...view, onComposerClick, rerenderConversation: () => view.rerender(tree()) };
}

describe('Thinking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetting = {
      key: 'reasoning_effort',
      default: 'low',
      options: ['auto', 'low', 'high'],
    } as unknown as SettingDefinition;
    mockConversation = {
      conversationId: 'convo-1',
      reasoning_effort: 'low',
    } as unknown as TConversation;
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

  it('aligns three radio hit areas with the visual stop midpoints', async () => {
    mockSetting = {
      key: 'reasoning_effort',
      default: 'low',
      options: ['auto', 'low', 'medium', 'high'],
    } as unknown as SettingDefinition;
    const user = userEvent.setup();
    renderInComposer();

    await user.click(screen.getByTestId('composer-thinking-button'));
    const [low, medium, high] = screen.getAllByRole('radio');

    expect(low.style.left).toBe('0px');
    expect(low.style.right).toBe('calc(75% - 7px)');
    expect(medium.style.left).toBe('calc(25% + 7px)');
    expect(medium.style.right).toBe('calc(25% + 7px)');
    expect(high.style.left).toBe('calc(75% - 7px)');
    expect(high.style.right).toBe('0px');
  });

  it('uses the provider mapping for an unset Bedrock effort', async () => {
    mockSetting = {
      key: 'reasoning_effort',
      default: 'unset',
      options: ['unset', 'low', 'medium', 'high'],
      enumMappings: {
        unset: 'com_ui_off',
        low: 'com_ui_low',
        medium: 'com_ui_medium',
        high: 'com_ui_high',
      },
    } as unknown as SettingDefinition;
    mockConversation = {
      conversationId: 'convo-1',
      reasoning_effort: 'unset',
    } as unknown as TConversation;
    const user = userEvent.setup();
    renderInComposer();

    expect(screen.getByTestId('composer-thinking-button')).toHaveAccessibleName(
      'com_ui_composer_thinking_value:Off',
    );

    await user.click(screen.getByTestId('composer-thinking-button'));
    const off = screen.getByRole('button', { name: 'Off' });
    expect(off).toHaveAttribute('aria-pressed', 'true');
    await user.click(off);
    expect(mockSetValue).toHaveBeenCalledWith('low');
  });

  it('does not carry a remembered level across model settings', async () => {
    mockConversation = {
      conversationId: 'convo-1',
      endpoint: 'openAI',
      model: 'model-a',
      reasoning_effort: 'high',
    } as unknown as TConversation;
    const user = userEvent.setup();
    const { rerenderConversation } = renderInComposer();

    await user.click(screen.getByTestId('composer-thinking-button'));
    expect(screen.getByRole('radio', { name: 'High' })).toHaveAttribute('tabindex', '0');

    mockConversation = {
      ...mockConversation,
      reasoning_effort: 'auto',
    } as unknown as TConversation;
    rerenderConversation();
    expect(screen.getByRole('radio', { name: 'High' })).toHaveAttribute('tabindex', '0');

    mockConversation = { ...mockConversation, model: 'model-b' };
    rerenderConversation();
    expect(screen.getByRole('radio', { name: 'Low' })).toHaveAttribute('tabindex', '0');
  });
});
