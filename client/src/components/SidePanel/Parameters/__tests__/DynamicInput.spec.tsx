import React from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen, act, fireEvent } from '@testing-library/react';
import type { TSetOption, SettingRange } from 'librechat-data-provider';
import DynamicInput from '../DynamicInput';
import { ChatContext } from '~/Providers';

type ChatContextValue = React.ContextType<typeof ChatContext>;

const chatContextValue = { preset: null } as unknown as ChatContextValue;

function setup({
  type,
  range,
  settingKey,
}: {
  type: 'number' | 'string';
  range?: SettingRange;
  settingKey: string;
}) {
  const commit = jest.fn();
  const setOption = jest.fn(() => commit) as unknown as TSetOption;
  render(
    <ChatContext.Provider value={chatContextValue}>
      <DynamicInput
        settingKey={settingKey}
        type={type}
        range={range}
        setOption={setOption}
        conversation={{}}
      />
    </ChatContext.Provider>,
  );
  return { input: screen.getByRole('textbox'), commit };
}

describe('DynamicInput', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('strips typed non-numeric text for number settings', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const { input, commit } = setup({ type: 'number', settingKey: 'max_tokens' });

    await user.type(input, 'System');

    expect(input).toHaveValue('');
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(commit).toHaveBeenLastCalledWith('');
  });

  it('strips pasted or autofilled non-numeric text for number settings', () => {
    const { input, commit } = setup({ type: 'number', settingKey: 'max_tokens' });

    fireEvent.change(input, { target: { value: 'System' } });

    expect(input).toHaveValue('');
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(commit).toHaveBeenLastCalledWith('');
  });

  it('commits numeric input as a number for number settings', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const { input, commit } = setup({ type: 'number', settingKey: 'max_tokens' });

    await user.type(input, '4096');

    expect(input).toHaveValue('4096');
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(commit).toHaveBeenLastCalledWith(4096);
  });

  it('strips thousands separators from pasted values', () => {
    const { input, commit } = setup({ type: 'number', settingKey: 'maxContextTokens' });

    fireEvent.change(input, { target: { value: '120,000' } });

    expect(input).toHaveValue('120000');
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(commit).toHaveBeenLastCalledWith(120000);
  });

  it('allows typing negative numbers when the range permits (e.g. thinkingBudget -1)', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const { input, commit } = setup({
      type: 'number',
      range: { min: -1, max: 24576, step: 1 },
      settingKey: 'thinkingBudget',
    });

    await user.type(input, '-1');

    expect(input).toHaveValue('-1');
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(commit).toHaveBeenLastCalledWith(-1);
  });

  it('drops the minus sign when the range does not permit negatives', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const { input, commit } = setup({ type: 'number', settingKey: 'max_tokens' });

    await user.type(input, '-1');

    expect(input).toHaveValue('1');
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(commit).toHaveBeenLastCalledWith(1);
  });

  it('commits digit-only input as a string for string settings', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const { input, commit } = setup({ type: 'string', settingKey: 'modelLabel' });

    await user.type(input, '123');

    expect(input).toHaveValue('123');
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(commit).toHaveBeenLastCalledWith('123');
  });

  it('preserves the numeric sniffing fallback when no type is provided', () => {
    const commit = jest.fn();
    const setOption = jest.fn(() => commit) as unknown as TSetOption;
    render(
      <ChatContext.Provider value={chatContextValue}>
        <DynamicInput settingKey="custom" setOption={setOption} conversation={{}} />
      </ChatContext.Provider>,
    );
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: '42' } });
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(commit).toHaveBeenLastCalledWith(42);
  });
});
