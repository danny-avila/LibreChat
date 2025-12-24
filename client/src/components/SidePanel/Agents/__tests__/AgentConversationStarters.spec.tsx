import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import AgentConversationStarters from '~/components/SidePanel/Agents/AgentConversationStarters';

describe('AgentConversationStarters', () => {
  const inputClass = 'input-class';
  const labelClass = 'label-class';

  function setup(initialStarters: string[] = []) {
    const onChange = jest.fn();
    const field = { value: [...initialStarters], onChange };
    render(
      <RecoilRoot>
        <AgentConversationStarters
          field={field}
          inputClass={inputClass}
          labelClass={labelClass}
          initialStarters={initialStarters}
        />
      </RecoilRoot>,
    );
    return { onChange, field };
  }

  it('renders initial starters', () => {
    setup(['Hello', 'World']);
    expect(screen.getByDisplayValue('Hello')).toBeInTheDocument();
    expect(screen.getByDisplayValue('World')).toBeInTheDocument();
  });

  it('adds a new starter', () => {
    const { onChange } = setup([]);
    const input = screen.getByPlaceholderText(/conversation starter/i);
    fireEvent.change(input, { target: { value: 'New Starter' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(['New Starter']);
  });

  it('deletes a starter', () => {
    const { onChange } = setup(['ToDelete']);
    const deleteBtn = screen.getByLabelText(/delete/i);
    fireEvent.click(deleteBtn);
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
