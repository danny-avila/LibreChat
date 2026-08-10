import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Button, buttonVariants } from './Button';

describe('Button', () => {
  it('exposes theme-owned shape and density recipes', () => {
    render(
      <Button size="theme" shape="theme">
        Continue
      </Button>,
    );

    expect(screen.getByRole('button', { name: 'Continue' })).toHaveClass(
      'h-theme-control',
      'rounded-theme-control',
      'gap-theme-compact',
    );
  });

  it('preserves variant geometry until a shape is explicitly selected', () => {
    const { rerender } = render(<Button variant="subtle">Subtle</Button>);
    const button = screen.getByRole('button', { name: 'Subtle' });

    expect(button).toHaveClass('rounded-xl');
    expect(button).not.toHaveClass('rounded-lg');

    rerender(
      <Button variant="subtle" shape="theme">
        Subtle
      </Button>,
    );

    expect(button).toHaveClass('rounded-theme-control');
    expect(button).not.toHaveClass('rounded-xl');
  });

  it('preserves subtle geometry through the exported variant helper', () => {
    expect(buttonVariants({ variant: 'subtle' })).toContain('rounded-xl');
    expect(buttonVariants({ variant: 'subtle', shape: null })).toContain('rounded-xl');

    const themedSubtle = buttonVariants({ variant: 'subtle', shape: 'theme' });
    expect(themedSubtle).toContain('rounded-theme-control');
    expect(themedSubtle).not.toContain('rounded-xl');
  });
});
