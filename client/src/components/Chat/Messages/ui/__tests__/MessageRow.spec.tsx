import { render, screen } from '@testing-library/react';
import MessageRow from '../MessageRow';

jest.mock('../MessageTimestamp', () => ({
  __esModule: true,
  default: () => <span data-testid="message-timestamp" />,
}));

const MESSAGE_BODY = 'Message body';

const renderRow = ({
  isCreatedByUser,
  hasParallelContent = false,
  fullWidth = false,
  isEditing = false,
}: {
  isCreatedByUser: boolean;
  hasParallelContent?: boolean;
  fullWidth?: boolean;
  isEditing?: boolean;
}) =>
  render(
    <MessageRow
      id="message-1"
      label={isCreatedByUser ? 'You' : 'Assistant'}
      icon={<span data-testid="message-icon" />}
      footer={<div data-testid="message-actions" />}
      ariaLabel={isCreatedByUser ? 'User message' : 'Assistant message'}
      headerPrefix="Message from "
      isCreatedByUser={isCreatedByUser}
      hasParallelContent={hasParallelContent}
      fullWidth={fullWidth}
      isEditing={isEditing}
    >
      <p>{MESSAGE_BODY}</p>
    </MessageRow>,
  );

describe('MessageRow', () => {
  it('renders user content as a right-aligned semantic surface without a visible avatar', () => {
    renderRow({ isCreatedByUser: true });

    const row = screen.getByLabelText('User message');
    const userTurn = row.querySelector('.user-turn');
    const messageSurface = screen.getByText(MESSAGE_BODY).parentElement;

    expect(row).toHaveAttribute('role', 'group');
    expect(row).toHaveClass('justify-end');
    expect(userTurn).toHaveClass('items-end');
    expect(messageSurface).toHaveClass('bg-surface-tertiary', 'rounded-theme-surface');
    expect(screen.queryByTestId('message-icon')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { hidden: true })).toHaveClass('sr-only');
  });

  it('keeps assistant identity visible beside an open reading column', () => {
    renderRow({ isCreatedByUser: false });

    const row = screen.getByLabelText('Assistant message');

    expect(row.querySelector('.agent-turn')).toHaveClass('flex-1');
    expect(screen.getByTestId('message-icon')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Assistant/ })).toBeVisible();
  });

  it('preserves the assistant turn marker for parallel content', () => {
    renderRow({ isCreatedByUser: false, hasParallelContent: true });

    const row = screen.getByLabelText('Assistant message');

    expect(row.querySelector('.agent-turn')).toHaveClass('w-full');
    expect(screen.queryByTestId('message-icon')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('expands an edited user message without nesting the editor in a bubble', () => {
    renderRow({ isCreatedByUser: true, isEditing: true });

    const row = screen.getByLabelText('User message');
    const messageSurface = screen.getByTestId('message-body');

    expect(row.querySelector('.user-turn')).toHaveClass('w-full');
    expect(messageSurface).toHaveClass('w-full');
    expect(messageSurface).not.toHaveClass('bg-surface-tertiary');
  });

  it('expands an edited assistant message to full width', () => {
    renderRow({ isCreatedByUser: false, isEditing: true });

    const row = screen.getByLabelText('Assistant message');
    const messageSurface = screen.getByTestId('message-body');

    expect(row.querySelector('.agent-turn')).toHaveClass('w-full');
    expect(messageSurface).toHaveClass('w-full');
  });

  it('allows the maximized preference to use the full conversation width', () => {
    renderRow({ isCreatedByUser: false, fullWidth: true });

    expect(screen.getByLabelText('Assistant message')).toHaveClass('max-w-full');
  });
});
