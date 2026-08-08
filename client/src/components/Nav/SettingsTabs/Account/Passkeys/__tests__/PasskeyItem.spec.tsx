import React from 'react';
import userEvent from '@testing-library/user-event';
import type { TPasskey } from 'librechat-data-provider';
import type { PasskeyRemovalResult } from '../PasskeyItem';
import { render, screen, waitFor } from 'test/layout-test-utils';
import PasskeyItem from '../PasskeyItem';

const passkey: TPasskey = {
  id: 'p1',
  name: 'Work laptop',
  deviceType: 'multiDevice',
  backedUp: false,
  transports: ['internal'],
  createdAt: '2026-01-01T00:00:00.000Z',
  lastUsedAt: null,
};

type Overrides = {
  requiresPassword?: boolean;
  onDelete?: jest.Mock<Promise<PasskeyRemovalResult>>;
};

function setup({ requiresPassword = true, onDelete }: Overrides = {}) {
  const deleteMock = onDelete ?? jest.fn().mockResolvedValue('removed');
  render(
    <PasskeyItem
      passkey={passkey}
      isRenaming={false}
      isBusy={false}
      requiresPassword={requiresPassword}
      onStartRename={jest.fn()}
      onRename={jest.fn()}
      onDelete={deleteMock}
    />,
  );
  return { deleteMock, user: userEvent.setup() };
}

const openConfirmation = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Remove passkey' }));
};

describe('PasskeyItem removal step-up', () => {
  it('asks for the password before removing the credential', async () => {
    const { deleteMock, user } = setup();
    await openConfirmation(user);

    const field = screen.getByLabelText('Confirm your password');
    expect(field).toHaveAttribute('type', 'password');
    expect(field).toHaveFocus();

    await user.type(field, 'correct horse');
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith('p1', 'correct horse'));
  });

  it('keeps the delete action unavailable until a password is typed', async () => {
    const { deleteMock, user } = setup();
    await openConfirmation(user);

    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    await user.type(screen.getByLabelText('Confirm your password'), 'x');
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('reports a rejected password inline and returns focus to the field', async () => {
    const onDelete = jest.fn().mockResolvedValue('incorrect-password');
    const { user } = setup({ onDelete });
    await openConfirmation(user);

    const field = screen.getByLabelText('Confirm your password');
    expect(field).toHaveAttribute('aria-invalid', 'false');

    await user.type(field, 'wrong');
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Incorrect password. Please try again.');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAttribute('aria-describedby', alert.id);
    await waitFor(() => expect(field).toHaveFocus());
  });

  it('does not ask an account without a local password for one', async () => {
    const { deleteMock, user } = setup({ requiresPassword: false });
    await openConfirmation(user);

    expect(screen.queryByLabelText('Confirm your password')).not.toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Delete' });
    expect(confirm).toBeEnabled();

    await user.click(confirm);
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith('p1', ''));
  });

  it('cancels back to the row and returns focus to the remove control', async () => {
    const { deleteMock, user } = setup();
    await openConfirmation(user);

    await user.type(screen.getByLabelText('Confirm your password'), 'typed');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByLabelText('Confirm your password')).not.toBeInTheDocument();
    expect(deleteMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Remove passkey' })).toHaveFocus();
  });

  it('clears a typed password when the confirmation is reopened', async () => {
    const { user } = setup();
    await openConfirmation(user);
    await user.type(screen.getByLabelText('Confirm your password'), 'typed');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await openConfirmation(user);

    expect(screen.getByLabelText('Confirm your password')).toHaveValue('');
  });
});
