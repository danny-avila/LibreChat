import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import Badge from './Badge';

describe('Badge', () => {
  it('keeps the editing action button outside the badge button', () => {
    const onBadgeAction = jest.fn();
    const { container } = render(
      <Badge label="Tool" isAvailable={true} isEditing onBadgeAction={onBadgeAction} />,
    );

    expect(container.querySelector('button button')).toBeNull();
    expect(container.firstElementChild?.tagName).toBe('DIV');

    fireEvent.click(screen.getByRole('button', { name: 'Remove Tool' }));
    expect(onBadgeAction).toHaveBeenCalledTimes(1);
  });

  it('forwards editing-mode attributes and event handlers to the wrapper', () => {
    const onMouseDown = jest.fn();
    render(
      <Badge
        label="Tool"
        isAvailable={true}
        isEditing
        aria-label="Editable tool"
        data-testid="editable-badge"
        onMouseDown={onMouseDown}
      />,
    );

    const badge = screen.getByTestId('editable-badge');
    expect(badge).toHaveAttribute('aria-label', 'Editable tool');

    fireEvent.mouseDown(badge);
    expect(onMouseDown).toHaveBeenCalledTimes(1);
  });
});
