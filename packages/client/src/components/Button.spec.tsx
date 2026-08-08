import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Button } from './Button';

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
});
