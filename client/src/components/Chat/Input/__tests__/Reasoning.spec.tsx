import userEvent from '@testing-library/user-event';
import { act, render, screen, waitFor } from '@testing-library/react';
import { ReasoningEffort } from 'librechat-data-provider';
import type { SettingDefinition, TReasoningOverride } from 'librechat-data-provider';
import { ReasoningControl } from '../Reasoning';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

const enumSetting: SettingDefinition = {
  key: 'reasoning_effort',
  label: 'com_endpoint_reasoning_effort',
  labelCode: true,
  description: 'com_endpoint_openai_reasoning_effort',
  descriptionCode: true,
  type: 'enum',
  component: 'slider',
  default: ReasoningEffort.unset,
  options: [
    ReasoningEffort.unset,
    ReasoningEffort.minimal,
    ReasoningEffort.low,
    ReasoningEffort.medium,
    ReasoningEffort.high,
  ],
  enumMappings: {
    [ReasoningEffort.unset]: 'com_ui_auto',
    [ReasoningEffort.minimal]: 'com_ui_minimal',
    [ReasoningEffort.low]: 'com_ui_low',
    [ReasoningEffort.medium]: 'com_ui_medium',
    [ReasoningEffort.high]: 'com_ui_high',
  },
};

const budgetSetting: SettingDefinition = {
  key: 'thinkingBudget',
  label: 'com_endpoint_thinking_budget',
  labelCode: true,
  description: 'com_endpoint_google_thinking_budget',
  descriptionCode: true,
  type: 'number',
  component: 'input',
  range: { min: -1, positiveMin: 128, max: 32768, step: 128 },
};

describe('ReasoningControl', () => {
  it('renders a compact, localized disclosure for the next message', async () => {
    const user = userEvent.setup();
    render(
      <ReasoningControl
        setting={enumSetting}
        value={{ key: 'reasoning_effort', value: 'medium' } as TReasoningOverride}
        onChange={jest.fn()}
      />,
    );

    const trigger = screen.getByRole('button', {
      name: 'com_ui_reasoning_for_next_message com_ui_medium',
    });
    expect(trigger).toHaveClass('text-text-secondary');

    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: 'com_endpoint_reasoning_effort' })).toBeVisible();
    expect(screen.queryByText('com_endpoint_openai_reasoning_effort')).not.toBeInTheDocument();
  });

  it('stages the next vendor-native enum value from an accessible effort scale', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <ReasoningControl
        setting={enumSetting}
        value={{ key: 'reasoning_effort', value: 'medium' } as TReasoningOverride}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: /com_ui_reasoning_for_next_message/ }));
    const slider = screen.getByRole('slider', { name: 'com_endpoint_reasoning_effort' });
    expect(slider).toHaveAttribute('aria-valuenow', '3');
    expect(slider).toHaveAttribute('aria-valuetext', 'com_ui_medium');
    slider.focus();
    await user.keyboard('{ArrowRight}');

    expect(onChange).toHaveBeenLastCalledWith({ key: 'reasoning_effort', value: 'high' });
  });

  it('keeps focus inside the modal popover instead of treating background interaction as dismissal', async () => {
    const user = userEvent.setup();
    const backgroundActionLabel = 'background action';
    render(
      <>
        <button type="button">{backgroundActionLabel}</button>
        <ReasoningControl
          setting={enumSetting}
          value={{ key: 'reasoning_effort', value: 'medium' } as TReasoningOverride}
          onChange={jest.fn()}
        />
      </>,
    );

    const backgroundAction = screen.getByRole('button', { name: backgroundActionLabel });
    await user.click(screen.getByRole('button', { name: /com_ui_reasoning_for_next_message/ }));
    const dialog = screen.getByRole('dialog', { name: 'com_endpoint_reasoning_effort' });

    act(() => backgroundAction.focus());

    await waitFor(() => {
      expect(dialog).toBeVisible();
      expect(backgroundAction).not.toHaveFocus();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    });
  });

  it('normalizes numeric thinking budgets onto the same scale with exact input and auto', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <ReasoningControl
        setting={budgetSetting}
        value={{ key: 'thinkingBudget', value: 4096 }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: /com_ui_reasoning_for_next_message/ }));
    const slider = screen.getByRole('slider', { name: 'com_endpoint_thinking_budget' });
    expect(slider).toHaveAttribute('aria-valuemin', '128');
    expect(slider).toHaveAttribute('aria-valuemax', '32768');
    expect(slider).toHaveAttribute('aria-valuenow', '4096');

    slider.focus();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith({ key: 'thinkingBudget', value: 4224 });

    const input = screen.getByRole('spinbutton', { name: 'com_endpoint_thinking_budget' });
    await user.clear(input);
    await user.type(input, '8192');
    await user.tab();
    expect(onChange).toHaveBeenLastCalledWith({ key: 'thinkingBudget', value: 8192 });

    await user.click(screen.getByRole('button', { name: 'com_ui_auto' }));
    expect(onChange).toHaveBeenLastCalledWith({ key: 'thinkingBudget', value: -1 });
  });

  it('clamps an invalid positive budget to the model-specific floor', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <ReasoningControl
        setting={budgetSetting}
        value={{ key: 'thinkingBudget', value: -1 }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: /com_ui_reasoning_for_next_message/ }));
    const input = screen.getByRole('spinbutton', { name: 'com_endpoint_thinking_budget' });
    await user.clear(input);
    await user.type(input, '16');
    await user.tab();

    expect(onChange).toHaveBeenLastCalledWith({ key: 'thinkingBudget', value: 128 });
  });
});
