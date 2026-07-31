import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ProgressText from '../ProgressText';

const defaultProps = {
  progress: 1,
  inProgressText: 'Working',
  finishedText: 'Finished',
};

describe('ProgressText', () => {
  it('shows an expandable chevron only on hover or focus', () => {
    const onClick = jest.fn();
    render(<ProgressText {...defaultProps} hasInput onClick={onClick} />);

    const button = screen.getByRole('button', { name: 'Finished' });
    const chevron = button.querySelector('svg');

    expect(button).toHaveClass('group/disclosure');
    expect(chevron).toHaveClass(
      'opacity-0',
      'group-hover/disclosure:opacity-100',
      'group-focus-within/disclosure:opacity-100',
    );
    expect(chevron).toHaveClass('transition-transform');
    expect(chevron?.getAttribute('class')).not.toContain('transition-opacity');

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders no chevron or disclosure state without expandable content', () => {
    render(<ProgressText {...defaultProps} hasInput={false} />);

    const button = screen.getByRole('button', { name: 'Finished' });

    expect(button).toBeDisabled();
    expect(button).not.toHaveAttribute('aria-expanded');
    expect(button.querySelector('svg')).toBeNull();
  });
});
