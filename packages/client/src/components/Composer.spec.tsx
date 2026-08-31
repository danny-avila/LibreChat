import React, { useState } from 'react';
import '@testing-library/jest-dom';
import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import Composer from './Composer';

const Harness = ({
  onSubmit,
  canSubmit = true,
  disabled = false,
  submitOnEnter = true,
}: {
  onSubmit: jest.Mock;
  canSubmit?: boolean;
  disabled?: boolean;
  submitOnEnter?: boolean;
}) => {
  const [value, setValue] = useState('');
  return (
    <Composer
      value={value}
      onChange={setValue}
      onSubmit={onSubmit}
      canSubmit={canSubmit}
      disabled={disabled}
      submitOnEnter={submitOnEnter}
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
    fireEvent.change(field, { target: { value: '検討' } });
    fireEvent.keyDown(field, { key: 'Enter', isComposing: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  /** Safari reports `isComposing` as false on the very Enter that commits a
   *  candidate, so composition state and the legacy signals have to carry it. */
  it.each([
    ['tracked composition state', { key: 'Enter' }, true],
    ['a Process key', { key: 'Process' }, false],
    ['keyCode 229', { key: 'Enter', keyCode: 229 }, false],
  ])('leaves Enter to a Safari IME committing via %s', (_label, event, startComposition) => {
    const onSubmit = jest.fn();
    render(<Harness onSubmit={onSubmit} />);

    const field = screen.getByLabelText('Message input');
    fireEvent.change(field, { target: { value: '検討' } });
    if (startComposition) fireEvent.compositionStart(field);
    fireEvent.keyDown(field, event);
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.compositionEnd(field);
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  /** With "Press Enter to send" off, a bare Enter is a line break — reaching
   *  for one must not steer a run or navigate to a continued chat. */
  it('leaves a bare Enter alone when Enter-to-send is off', () => {
    const onSubmit = jest.fn();
    render(<Harness onSubmit={onSubmit} submitOnEnter={false} />);

    const field = screen.getByLabelText('Message input');
    fireEvent.change(field, { target: { value: 'A first line.' } });

    const bareEnter = createEvent.keyDown(field, { key: 'Enter' });
    fireEvent(field, bareEnter);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(bareEnter.defaultPrevented).toBe(false);

    fireEvent.keyDown(field, { key: 'Enter', metaKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(2);
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

  /** Continuing a settled thread needs no text, so its send button is live on
   *  an empty field — but a stray Enter must not navigate the reader away. */
  it('never submits an empty field on Enter, even where the button would', () => {
    const onSubmit = jest.fn();
    render(<Harness onSubmit={onSubmit} />);

    const field = screen.getByLabelText('Message input');
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(field, { target: { value: '   ' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();

    expect(screen.getByLabelText('Send it')).toBeEnabled();
    fireEvent.click(screen.getByLabelText('Send it'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('sends from the button and keeps the caller actions alongside it', () => {
    const onSubmit = jest.fn();
    render(<Harness onSubmit={onSubmit} />);

    expect(screen.getByRole('button', { name: 'Queue' })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Send it'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
