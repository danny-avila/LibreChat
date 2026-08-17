import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Button, buttonVariants } from './Button';
import { cn } from '~/utils';

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

  it('renders the header-action toggle from semantic tokens', () => {
    render(<Button variant="header-action">Toggle</Button>);

    expect(screen.getByRole('button', { name: 'Toggle' })).toHaveClass(
      'bg-presentation',
      'border-border-light',
      'rounded-xl',
      'duration-0',
      'hover:bg-surface-active-alt',
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

  it('provides compact row actions with a distinct hover surface', () => {
    render(
      <Button variant="row-action" size="icon-sm">
        Open
      </Button>,
    );

    expect(screen.getByRole('button', { name: 'Open' })).toHaveClass(
      'size-8',
      'p-0',
      'rounded-lg',
      'hover:bg-surface-hover-alt',
    );
  });

  /**
   * Section actions sit close enough to their heading and to each other that
   * the default offset ring crosses a neighbour, so this variant has to win
   * both radius and ring — and stay distinct from `row-action` above.
   */
  it('gives section actions an inset ring and a tighter radius', () => {
    render(
      <Button variant="section-action" size="icon-xs" aria-label="Filter">
        <span />
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Filter' });

    expect(button).toHaveClass('size-7', 'rounded-md', 'focus-visible:ring-inset');
    expect(button).not.toHaveClass('rounded-lg', 'focus-visible:ring-offset-2');
  });

  /**
   * `buttonVariants` returns raw recipe output, so conflicting utilities from
   * the base survive it. Call sites applying the recipe to a non-Button element
   * have to merge it themselves, and this is what breaks if they forget.
   */
  it('leaves overridden base utilities in the unmerged variant helper', () => {
    const sectionAction = buttonVariants({ variant: 'section-action', size: 'icon-xs' });

    expect(sectionAction).toContain('rounded-md');
    expect(sectionAction).toContain('rounded-lg');
    expect(cn(sectionAction)).not.toContain('rounded-lg');
  });
});
