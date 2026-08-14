import { render, screen } from '@testing-library/react';
import AuthorHeader from '../AuthorHeader';

const renderHeader = () =>
  render(<AuthorHeader icon={<span data-testid="author-icon" />} label="GitHub Agent" />);

describe('AuthorHeader', () => {
  it('restates the author with an icon and a heading', () => {
    renderHeader();

    expect(screen.getByTestId('author-icon')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'GitHub Agent' })).toBeVisible();
  });

  it('only outdents past the avatar gutter where that gutter exists', () => {
    renderHeader();

    const header = screen.getByTestId('author-header');

    expect(header).toHaveClass('w-full', 'md:-ml-9', 'md:w-[calc(100%+2.25rem)]');
    expect(header).not.toHaveClass('-ml-9');
  });

  it('keeps the icon out of the accessible name', () => {
    renderHeader();

    expect(screen.getByTestId('author-icon').closest('[aria-hidden="true"]')).not.toBeNull();
  });
});
