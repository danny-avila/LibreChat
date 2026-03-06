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

jest.mock('react-lazy-load-image-component', () => ({
  LazyLoadImage: ({
    alt,
    src,
    className,
    onLoad,
    placeholder,
    visibleByDefault: _visibleByDefault,
    ...rest
  }: {
    alt: string;
    src: string;
    className: string;
    onLoad: () => void;
    placeholder: React.ReactNode;
    visibleByDefault?: boolean;
    [key: string]: unknown;
  }) => (
    <div data-testid="lazy-image-wrapper">
      <img
        alt={alt}
        src={src}
        className={className}
        onLoad={onLoad}
        data-testid="lazy-image"
        {...rest}
      />
      <div data-testid="placeholder">{placeholder}</div>
    </div>
  ),
}));

jest.mock('@librechat/client', () => ({
  Skeleton: ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div data-testid="skeleton" className={className} {...props} />
  ),
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
      const img = screen.getByTestId('lazy-image');
      expect(img.className).toContain('max-h-[45vh]');
    });

    it('renders with max-w-full to prevent landscape clipping', () => {
      render(<Image {...defaultProps} />);
      const img = screen.getByTestId('lazy-image');
      expect(img.className).toContain('max-w-full');
    });

    it('renders with w-auto and h-auto for natural aspect ratio', () => {
      render(<Image {...defaultProps} />);
      const img = screen.getByTestId('lazy-image');
      expect(img.className).toContain('w-auto');
      expect(img.className).toContain('h-auto');
    });

    it('starts with opacity-0 before image loads', () => {
      render(<Image {...defaultProps} />);
      const img = screen.getByTestId('lazy-image');
      expect(img.className).toContain('opacity-0');
      expect(img.className).not.toContain('opacity-100');
    });

    it('transitions to opacity-100 after image loads', () => {
      render(<Image {...defaultProps} />);
      const img = screen.getByTestId('lazy-image');

      fireEvent.load(img);

      expect(img.className).toContain('opacity-100');
    });

    it('applies custom className to the button wrapper', () => {
      render(<Image {...defaultProps} className="mb-4" />);
      const button = screen.getByRole('button');
      expect(button.className).toContain('mb-4');
    });

    it('sets correct alt text', () => {
      render(<Image {...defaultProps} />);
      const img = screen.getByTestId('lazy-image');
      expect(img).toHaveAttribute('alt', 'Test image');
    });
  });

  describe('skeleton placeholder', () => {
    it('renders skeleton with non-zero dimensions', () => {
      render(<Image {...defaultProps} />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton.className).toContain('h-48');
      expect(skeleton.className).toContain('w-full');
      expect(skeleton.className).toContain('max-w-lg');
    });

    it('renders skeleton with max-h constraint', () => {
      render(<Image {...defaultProps} />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton.className).toContain('max-h-[45vh]');
    });

    it('has accessible loading attributes', () => {
      render(<Image {...defaultProps} />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton).toHaveAttribute('aria-label', 'Loading image');
      expect(skeleton).toHaveAttribute('aria-busy', 'true');
    });
  });

  describe('dialog interaction', () => {
    it('opens dialog on button click after image loads', () => {
      render(<Image {...defaultProps} />);

      const img = screen.getByTestId('lazy-image');
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
      const img = screen.getByTestId('lazy-image');
      expect(img).toHaveAttribute('src', '/images/test.png');
    });

    it('passes absolute http URLs through unchanged', () => {
      render(<Image {...defaultProps} imagePath="https://example.com/photo.jpg" />);
      const img = screen.getByTestId('lazy-image');
      expect(img).toHaveAttribute('src', 'https://example.com/photo.jpg');
    });

    it('passes data URIs through unchanged', () => {
      render(<Image {...defaultProps} imagePath="data:image/png;base64,abc" />);
      const img = screen.getByTestId('lazy-image');
      expect(img).toHaveAttribute('src', 'data:image/png;base64,abc');
    });

    it('passes non-/images/ paths through unchanged', () => {
      render(<Image {...defaultProps} imagePath="/other/path.png" />);
      const img = screen.getByTestId('lazy-image');
      expect(img).toHaveAttribute('src', '/other/path.png');
    });
  });
});
