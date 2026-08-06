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
});
