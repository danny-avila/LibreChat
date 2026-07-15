import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { EModelEndpoint, ReasoningEffort } from 'librechat-data-provider';
import type { TConversation, TModelSpec } from 'librechat-data-provider';
import Reasoning from '../Reasoning';

const mockSetReasoning = jest.fn();
const mockSetOption = jest.fn(() => mockSetReasoning);

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) =>
    ({
      com_endpoint_thinking: 'Thinking',
      com_ui_auto: 'Auto',
      com_ui_low: 'Low',
      com_ui_high: 'High',
    })[key] ?? key,
  useSetIndexOptions: () => ({ setOption: mockSetOption }),
}));

jest.mock('~/data-provider', () => ({
  useGetEndpointsQuery: () => ({ data: {} }),
}));

jest.mock('@librechat/client', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require('react');
  return {
    TooltipAnchor: (props) => props.render,
    DropdownPopup: (props) =>
      R.createElement(
        'div',
        null,
        props.trigger,
        R.createElement(
          'div',
          { role: 'menu' },
          props.items.map((item, index) =>
            R.createElement(
              'button',
              {
                key: item.id,
                role: 'menuitemcheckbox',
                'aria-checked': item.ariaChecked,
                onClick: item.onClick,
                'data-testid': `reasoning-option-${index}`,
              },
              item.label,
            ),
          ),
        ),
      ),
  };
});

jest.mock('@ariakit/react', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require('react');
  return {
    MenuButton: (props) => R.createElement('button', props, props.children),
  };
});

function createModelSpec(reasoning: TModelSpec['reasoning']): TModelSpec {
  return {
    name: 'reasoning-spec',
    label: 'Reasoning Spec',
    reasoning,
    preset: {
      endpoint: EModelEndpoint.openAI,
      model: 'o3',
      reasoning_effort: ReasoningEffort.high,
    },
  };
}

function createConversation(
  reasoningEffort: ReasoningEffort = ReasoningEffort.high,
): TConversation {
  return {
    endpoint: EModelEndpoint.openAI,
    model: 'o3',
    spec: 'reasoning-spec',
    reasoning_effort: reasoningEffort,
  } as TConversation;
}

describe('Reasoning', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when the model spec has not opted in', () => {
    const { container } = render(
      <Reasoning
        index={0}
        disabled={false}
        modelSpec={createModelSpec(false)}
        conversation={createConversation()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the current value and only the configured options', () => {
    render(
      <Reasoning
        index={0}
        disabled={false}
        modelSpec={createModelSpec([ReasoningEffort.low, ReasoningEffort.high])}
        conversation={createConversation()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Thinking: High' })).toBeInTheDocument();
    expect(screen.getAllByRole('menuitemcheckbox')).toHaveLength(2);
    expect(screen.getByRole('menuitemcheckbox', { name: 'High' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('updates the provider-native conversation option', () => {
    render(
      <Reasoning
        index={2}
        disabled={false}
        modelSpec={createModelSpec([ReasoningEffort.low, ReasoningEffort.high])}
        conversation={createConversation()}
      />,
    );

    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Low' }));

    expect(mockSetOption).toHaveBeenCalledWith('reasoning_effort');
    expect(mockSetReasoning).toHaveBeenCalledWith(ReasoningEffort.low);
  });

  it('disables the trigger with the rest of the composer controls', () => {
    render(
      <Reasoning
        index={0}
        disabled={true}
        modelSpec={createModelSpec(true)}
        conversation={createConversation()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Thinking: High' })).toBeDisabled();
  });
});
