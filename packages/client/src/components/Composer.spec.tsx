import React, { useState } from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import Composer from './Composer';

const Harness = ({
  onSubmit,
  canSubmit = true,
  disabled = false,
}: {
  onSubmit: jest.Mock;
  canSubmit?: boolean;
  disabled?: boolean;
}) => {
  const [value, setValue] = useState('');
  return (
    <Composer
      value={value}
      onChange={setValue}
      onSubmit={onSubmit}
      canSubmit={canSubmit}
      disabled={disabled}
      submitLabel="Send it"
      ariaLabel="Message input"
      placeholder="Message Amara Nwosu"
      actions={<button type="button">Queue</button>}
    />
  );
};

describe('Composer', () => {
  it('submits on Enter and keeps Shift+Enter for a newline', () => {
    const onSubmit = jest.fn();
    render(<Harness onSubmit={onSubmit} />);

    const field = screen.getByLabelText('Message input');
    expect(field).toHaveAttribute('placeholder', 'Message Amara Nwosu');
    fireEvent.change(field, { target: { value: 'Look at the second source.' } });

    fireEvent.keyDown(field, { key: 'Enter', shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  /** Committing an IME candidate fires Enter; submitting there would send a
   *  half-typed word in every CJK locale. */
  it('leaves Enter to the IME while a candidate is composing', () => {
    const onSubmit = jest.fn();
    render(<Harness onSubmit={onSubmit} />);

    const field = screen.getByLabelText('Message input');
    fireEvent.keyDown(field, { key: 'Enter', isComposing: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('withholds submission but not typing when the surface cannot accept it', () => {
    const onSubmit = jest.fn();
    render(<Harness onSubmit={onSubmit} canSubmit={false} />);

    const field = screen.getByLabelText('Message input');
    expect(field).toBeEnabled();
    fireEvent.change(field, { target: { value: 'Draft.' } });
    expect(field).toHaveValue('Draft.');

    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Send it')).toBeDisabled();
  });

  it('sends from the button and keeps the caller actions alongside it', () => {
    const onSubmit = jest.fn();
    render(<Harness onSubmit={onSubmit} />);

    expect(screen.getByRole('button', { name: 'Queue' })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Send it'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
