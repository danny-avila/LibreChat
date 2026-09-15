import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Description, { getPlainDescription } from '../Description';

describe('Description', () => {
  it('renders supported HTML with normalized safe links', () => {
    render(
      <Description description={'<span>Read <a href="https://example.com">the guide</a></span>'} />,
    );

    const link = screen.getByRole('link', { name: 'the guide' });
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('removes executable markup and unsafe URLs', () => {
    const { container } = render(
      <Description
        description={
          '<span class="fixed inset-0" onclick="alert(1)">Safe</span><a class="fixed" href="javascript:alert(1)">Link</a><img src="https://tracker.example/pixel" onerror="alert(1)"><script>alert(1)</script>'
        }
      />,
    );

    expect(container.querySelector('script')).not.toBeInTheDocument();
    expect(container.querySelector('[onclick]')).not.toBeInTheDocument();
    expect(container.querySelector('[class]')).not.toBeInTheDocument();
    expect(screen.getByText('Link')).not.toHaveAttribute('href');
    expect(container.querySelector('img')).not.toBeInTheDocument();
  });

  it('retains sanitized media only when explicitly enabled', () => {
    const { container } = render(
      <Description
        allowMedia
        description={'<img class="brand" src="/assets/brand.svg" alt="Brand">'}
      />,
    );

    expect(container.querySelector('img')).toHaveAttribute('src', '/assets/brand.svg');
    expect(container.querySelector('img')).toHaveAttribute('class', 'brand');
  });

  it('renders HTML descriptions as inert plain text for previews', () => {
    const description =
      '<span>Assistant for projects.<br><a href="https://example.com">Read &amp; learn</a></span>';
    const { container } = render(
      <Description as="p" description={description} plainText aria-label="Description preview" />,
    );

    expect(screen.getByText('Assistant for projects. Read & learn')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(container.querySelector('span')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Description preview')).toBeInTheDocument();
    expect(getPlainDescription(description)).toBe('Assistant for projects. Read & learn');
  });

  it('preserves ordinary text without interpreting embedded angle brackets', () => {
    render(<Description description="Use x < y safely" />);

    expect(screen.getByText('Use x < y safely')).toBeInTheDocument();
  });
});
