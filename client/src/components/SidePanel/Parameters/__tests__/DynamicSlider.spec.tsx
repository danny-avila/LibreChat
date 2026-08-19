import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import type { TSetOption, SettingRange } from 'librechat-data-provider';
import DynamicSlider from '../DynamicSlider';
import { ChatContext } from '~/Providers';

type ChatContextValue = React.ContextType<typeof ChatContext>;

const chatContextValue = { preset: null } as unknown as ChatContextValue;

const range: SettingRange = { min: 0, max: 2, step: 0.01 };

function setup(conversationValue: number) {
  const commit = jest.fn();
  const setOption = jest.fn(() => commit) as unknown as TSetOption;
  render(
    <ChatContext.Provider value={chatContextValue}>
      <DynamicSlider
        settingKey="temperature"
        label="Temperature"
        type="number"
        range={range}
        defaultValue={1}
        setOption={setOption}
        conversation={{ temperature: conversationValue }}
      />
    </ChatContext.Provider>,
  );
  return { slider: screen.getByRole('slider'), commit };
}

describe('DynamicSlider', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /**
   * The browser dispatches `dblclick` after the second pointer release, so the
   * commit has already flushed by the time the reset is queued. An action
   * clicked in the debounce window would otherwise read the pre-reset value.
   */
  it('commits a double-click reset without waiting for the debounce', () => {
    const { slider, commit } = setup(0.2);

    fireEvent.doubleClick(slider);

    expect(commit).toHaveBeenCalledWith(1);
  });

  it('still lands the reset exactly once after the debounce elapses', () => {
    const { slider, commit } = setup(0.2);

    fireEvent.doubleClick(slider);
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenLastCalledWith(1);
  });
});
