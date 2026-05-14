import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ControllerRenderProps } from 'react-hook-form';
import type { AgentForm } from '~/common';
import AgentLangfuse from '../AgentLangfuse';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

function createField(
  value: AgentForm['langfuse'],
  onChange = jest.fn(),
): ControllerRenderProps<AgentForm, 'langfuse'> {
  return {
    name: 'langfuse',
    value,
    onChange,
    onBlur: jest.fn(),
    ref: jest.fn(),
  };
}

describe('AgentLangfuse', () => {
  it('can clear an explicit enabled override back to inherited', () => {
    const onChange = jest.fn();
    render(<AgentLangfuse field={createField({ enabled: false }, onChange)} />);

    fireEvent.click(screen.getByText('com_ui_agent_langfuse_use_inherited'));

    expect(onChange).toHaveBeenCalledWith({
      enabled: null,
      publicKey: '',
      secretKey: '',
      baseUrl: '',
    });
  });

  it('keeps credential fields visible while enabled is inherited', () => {
    render(<AgentLangfuse field={createField({ enabled: null, publicKey: 'pk-agent' })} />);

    expect(screen.getByDisplayValue('pk-agent')).toBeInTheDocument();
    expect(screen.getByText('com_ui_agent_langfuse_inherited')).toBeInTheDocument();
  });
});
