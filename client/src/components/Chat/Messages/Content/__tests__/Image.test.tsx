import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Image from '../Image';

jest.mock('~/utils', () => ({
  cn: (...classes: unknown[]) =>
    classes
      .flat(Infinity)
      .filter((c) => typeof c === 'string' && c.length > 0)
      .join(' '),
}));

jest.mock('librechat-data-provider', () => ({
  apiBaseUrl: () => '',
}));

jest.mock('../DialogImage', () => ({
  __esModule: true,
  default: ({ isOpen, src }: { isOpen: boolean; src: string }) =>
    isOpen ? <div data-testid="dialog-image" data-src={src} /> : null,
}));

describe('Image', () => {
  const defaultProps = {
    imagePath: '/images/test.png',
    altText: 'Test image',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders with max-h-[45vh] height constraint', () => {
      render(<Image {...defaultProps} />);
      const img = screen.getByRole('img');
      expect(img.className).toContain('max-h-[45vh]');
    });

    it('renders with max-w-full to prevent landscape clipping', () => {
      render(<Image {...defaultProps} />);
      const img = screen.getByRole('img');
      expect(img.className).toContain('max-w-full');
    });

    it('renders with w-auto and h-auto for natural aspect ratio', () => {
      render(<Image {...defaultProps} />);
      const img = screen.getByRole('img');
      expect(img.className).toContain('w-auto');
      expect(img.className).toContain('h-auto');
    });

    it('uses async decoding for non-blocking paint', () => {
      render(<Image {...defaultProps} />);
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('decoding', 'async');
    });

    it('applies custom className to the button wrapper', () => {
      render(<Image {...defaultProps} className="mb-4" />);
      const button = screen.getByRole('button');
      expect(button.className).toContain('mb-4');
    });

    it('sets correct alt text', () => {
      render(<Image {...defaultProps} />);
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('alt', 'Test image');
    });

    it('renders image immediately without opacity transition', () => {
      render(<Image {...defaultProps} />);
      const img = screen.getByRole('img');
      expect(img.className).not.toContain('opacity-0');
      expect(img.className).not.toContain('transition-opacity');
    });
  });

  describe('dialog interaction', () => {
    it('opens dialog on button click after image loads', () => {
      render(<Image {...defaultProps} />);

      const img = screen.getByRole('img');
      fireEvent.load(img);

      expect(screen.queryByTestId('dialog-image')).not.toBeInTheDocument();

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(screen.getByTestId('dialog-image')).toBeInTheDocument();
    });

    it('does not render dialog before image loads', () => {
      render(<Image {...defaultProps} />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(screen.queryByTestId('dialog-image')).not.toBeInTheDocument();
    });

    it('has correct accessibility attributes on button', () => {
      render(<Image {...defaultProps} />);
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'View Test image in dialog');
      expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    });
  });

  describe('image URL resolution', () => {
    it('passes /images/ paths through with base URL', () => {
      render(<Image {...defaultProps} imagePath="/images/test.png" />);
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', '/images/test.png');
    });

    it('passes absolute http URLs through unchanged', () => {
      render(<Image {...defaultProps} imagePath="https://example.com/photo.jpg" />);
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', 'https://example.com/photo.jpg');
    });

    it('passes data URIs through unchanged', () => {
      render(<Image {...defaultProps} imagePath="data:image/png;base64,abc" />);
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', 'data:image/png;base64,abc');
    });

    it('passes non-/images/ paths through unchanged', () => {
      render(<Image {...defaultProps} imagePath="/other/path.png" />);
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', '/other/path.png');
    });
  });
});
