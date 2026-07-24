import React from 'react';
import { render, screen } from '@testing-library/react';
import OpenAIVideoGen from '../Parts/OpenAIVideoGen/OpenAIVideoGen';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('../ToolOutput', () => ({
  ToolIcon: ({ type, isAnimating }: { type: string; isAnimating?: boolean }) => (
    <span data-testid="tool-icon" data-type={type} data-animating={isAnimating} />
  ),
  isError: (output: string) => /^Error:\s*(\[.*?\]\s*)*tool call failed:/i.test(output),
}));

describe('OpenAIVideoGen', () => {
  it('renders the generated video attachment with controls', () => {
    render(
      <OpenAIVideoGen
        initialProgress={1}
        isSubmitting={false}
        attachments={[
          {
            filename: 'generated.mp4',
            filepath: '/uploads/generated.mp4',
          } as never,
        ]}
      />,
    );

    expect(screen.getByLabelText('generated.mp4')).toHaveAttribute('src', '/uploads/generated.mp4');
    expect(screen.getAllByText('com_ui_video_created')).toHaveLength(2);
  });

  it('shows an animated generation state before the attachment is ready', () => {
    render(<OpenAIVideoGen initialProgress={0.1} isSubmitting />);

    expect(screen.getByTestId('tool-icon')).toHaveAttribute('data-type', 'video_gen');
    expect(screen.getByTestId('tool-icon')).toHaveAttribute('data-animating', 'true');
    expect(screen.getAllByText('com_ui_generating_video')).toHaveLength(2);
  });

  it('shows a failed state for the production tool-error format', () => {
    render(
      <OpenAIVideoGen
        initialProgress={1}
        isSubmitting={false}
        output="Error: tool call failed: Video generation failed: timed out"
      />,
    );

    expect(screen.getAllByText('com_ui_video_gen_failed')).toHaveLength(2);
    expect(screen.getByTestId('tool-icon')).toHaveAttribute('data-animating', 'false');
  });

  it('shows a terminal failed state when generation is cancelled', () => {
    render(<OpenAIVideoGen initialProgress={0.5} isSubmitting={false} />);

    expect(screen.getAllByText('com_ui_video_gen_failed')).toHaveLength(2);
    expect(screen.getByTestId('tool-icon')).toHaveAttribute('data-animating', 'false');
  });

  it('shows a terminal failed state when storage produced no attachment', () => {
    render(<OpenAIVideoGen initialProgress={1} isSubmitting={false} />);

    expect(screen.getAllByText('com_ui_video_gen_failed')).toHaveLength(2);
    expect(screen.getByTestId('tool-icon')).toHaveAttribute('data-animating', 'false');
  });
});
