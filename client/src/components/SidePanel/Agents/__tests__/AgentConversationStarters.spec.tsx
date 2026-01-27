import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import AgentConversationStarters from '~/components/SidePanel/Agents/AgentConversationStarters';
import { Constants } from 'librechat-data-provider';

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

  it('prevents adding more than MAX_CONVO_STARTERS', () => {
    const starters = Array(Constants.MAX_CONVO_STARTERS).fill('Item');
    const { onChange } = setup(starters);
    const input = screen.getByPlaceholderText(/max/i);
    fireEvent.change(input, { target: { value: 'Overflow' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(onChange).not.toHaveBeenCalledWith(expect.arrayContaining(['Overflow']));
  });

  it('triggers shake animation when adding beyond max limit', () => {
    const starters = Array(Constants.MAX_CONVO_STARTERS).fill('Item');
    setup(starters);
    const input = screen.getByPlaceholderText(/max/i);
    fireEvent.change(input, { target: { value: 'Overflow' } });
    // Mock classList for shake
    input.classList.remove = jest.fn();
    input.classList.add = jest.fn();
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(input.classList.add).toHaveBeenCalledWith('shake');
  });

  it('initializes starters from initialStarters when field.value is empty', () => {
    const initialStarters = ['Init1', 'Init2'];
    const onChange = jest.fn();
    const field = { value: [], onChange };
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
    expect(onChange).toHaveBeenCalledWith(initialStarters);
  });

  it('allows editing an existing conversation starter', () => {
    const { onChange, field } = setup(['EditMe']);
    const input = screen.getByDisplayValue('EditMe');
    fireEvent.change(input, { target: { value: 'Edited' } });
    expect(onChange).toHaveBeenCalledWith(['Edited']);
  });
});
