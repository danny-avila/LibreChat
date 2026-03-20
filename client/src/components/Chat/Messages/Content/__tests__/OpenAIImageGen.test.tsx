import React from 'react';
import { render, screen } from '@testing-library/react';
import OpenAIImageGen from '../Parts/OpenAIImageGen/OpenAIImageGen';

jest.mock('~/utils', () => ({
  cn: (...classes: (string | boolean | undefined | null)[]) =>
    classes
      .flat(Infinity)
      .filter((c): c is string => typeof c === 'string' && c.length > 0)
      .join(' '),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/components/Chat/Messages/Content/Image', () => ({
  __esModule: true,
  default: ({
    altText,
    imagePath,
    className,
  }: {
    altText: string;
    imagePath: string;
    className?: string;
  }) => (
    <div
      data-testid="image-component"
      data-alt={altText}
      data-src={imagePath}
      className={className}
    />
  ),
}));

jest.mock('@librechat/client', () => ({
  PixelCard: ({ progress }: { progress: number }) => (
    <div data-testid="pixel-card" data-progress={progress} />
  ),
}));

jest.mock('../Parts/OpenAIImageGen/ProgressText', () => ({
  __esModule: true,
  default: ({ progress, error }: { progress: number; error: boolean }) => (
    <div data-testid="progress-text" data-progress={progress} data-error={String(error)} />
  ),
}));

describe('OpenAIImageGen', () => {
  const defaultProps = {
    initialProgress: 0.1,
    isSubmitting: true,
    toolName: 'image_gen_oai',
    args: '{"prompt":"a cat","quality":"high","size":"1024x1024"}',
    output: null as string | null,
    attachments: undefined,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('image preloading', () => {
    it('keeps Image mounted during generation (progress < 1)', () => {
      render(<OpenAIImageGen {...defaultProps} initialProgress={0.5} />);
      expect(screen.getByTestId('image-component')).toBeInTheDocument();
    });

    it('hides Image with invisible absolute while progress < 1', () => {
      render(<OpenAIImageGen {...defaultProps} initialProgress={0.5} />);
      const image = screen.getByTestId('image-component');
      expect(image.className).toContain('invisible');
      expect(image.className).toContain('absolute');
    });

    it('shows Image without hiding classes when progress >= 1', () => {
      render(
        <OpenAIImageGen
          {...defaultProps}
          initialProgress={1}
          isSubmitting={false}
          attachments={[
            {
              filename: 'cat.png',
              filepath: '/images/cat.png',
              conversationId: 'conv1',
            } as never,
          ]}
        />,
      );
      const image = screen.getByTestId('image-component');
      expect(image.className).not.toContain('invisible');
      expect(image.className).not.toContain('absolute');
    });
  });

  describe('PixelCard visibility', () => {
    it('shows PixelCard when progress < 1', () => {
      render(<OpenAIImageGen {...defaultProps} initialProgress={0.5} />);
      expect(screen.getByTestId('pixel-card')).toBeInTheDocument();
    });

    it('hides PixelCard when progress >= 1', () => {
      render(<OpenAIImageGen {...defaultProps} initialProgress={1} isSubmitting={false} />);
      expect(screen.queryByTestId('pixel-card')).not.toBeInTheDocument();
    });
  });

  describe('layout classes', () => {
    it('applies max-h-[45vh] to the outer container', () => {
      const { container } = render(<OpenAIImageGen {...defaultProps} />);
      const outerDiv = container.querySelector('[class*="max-h-"]');
      expect(outerDiv?.className).toContain('max-h-[45vh]');
    });

    it('applies h-[45vh] w-full to inner container during loading', () => {
      const { container } = render(<OpenAIImageGen {...defaultProps} initialProgress={0.5} />);
      const innerDiv = container.querySelector('[class*="h-[45vh]"]');
      expect(innerDiv).not.toBeNull();
      expect(innerDiv?.className).toContain('w-full');
    });

    it('applies w-auto to inner container when complete', () => {
      const { container } = render(
        <OpenAIImageGen {...defaultProps} initialProgress={1} isSubmitting={false} />,
      );
      const overflowDiv = container.querySelector('[class*="overflow-hidden"]');
      expect(overflowDiv?.className).toContain('w-auto');
    });
  });

  describe('args parsing', () => {
    it('parses quality from args', () => {
      render(<OpenAIImageGen {...defaultProps} />);
      expect(screen.getByTestId('progress-text')).toBeInTheDocument();
    });

    it('handles invalid JSON args gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      render(<OpenAIImageGen {...defaultProps} args="invalid json" />);
      expect(screen.getByTestId('image-component')).toBeInTheDocument();
      consoleSpy.mockRestore();
    });

    it('handles object args', () => {
      render(
        <OpenAIImageGen
          {...defaultProps}
          args={{ prompt: 'a dog', quality: 'low', size: '512x512' }}
        />,
      );
      expect(screen.getByTestId('image-component')).toBeInTheDocument();
    });
  });

  describe('cancellation', () => {
    it('shows error state when output contains error', () => {
      render(
        <OpenAIImageGen
          {...defaultProps}
          output="Error processing tool call"
          isSubmitting={false}
          initialProgress={0.5}
        />,
      );
      const progressText = screen.getByTestId('progress-text');
      expect(progressText).toHaveAttribute('data-error', 'true');
    });

    it('shows cancelled state when not submitting and incomplete', () => {
      render(<OpenAIImageGen {...defaultProps} isSubmitting={false} initialProgress={0.5} />);
      const progressText = screen.getByTestId('progress-text');
      expect(progressText).toHaveAttribute('data-error', 'true');
    });
  });
});
