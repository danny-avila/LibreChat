import { ContentTypes } from 'librechat-data-provider';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { TMessageContentParts } from 'librechat-data-provider';
import ActivityPhaseGroup from '../ActivityPhaseGroup';

const mockUseSmoothStreaming = jest.fn(() => true);
const mockScheduleLayoutReconcile = jest.fn((_target: HTMLElement | null) => jest.fn());

jest.mock('~/hooks/Messages/useSmoothStreaming', () => ({
  __esModule: true,
  default: () => mockUseSmoothStreaming(),
}));

jest.mock('~/hooks', () => {
  return {
    useExpandCollapse: jest.requireActual('~/hooks/Messages/useExpandCollapse').default,
    scheduleMessageContentLayoutReconcile: (target: HTMLElement | null) =>
      mockScheduleLayoutReconcile(target),
  };
});

const labelPart = {
  type: ContentTypes.ACTIVITY_LABEL,
  [ContentTypes.ACTIVITY_LABEL]: 'Compared both release paths',
  activity_label_type: 'phase',
  activity_start_index: 0,
  pending: false,
} as unknown as Extract<TMessageContentParts, { type: ContentTypes.ACTIVITY_LABEL }>;

describe('ActivityPhaseGroup', () => {
  let collapseFrame: FrameRequestCallback | undefined;
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalCancelAnimationFrame = window.cancelAnimationFrame;

  beforeEach(() => {
    collapseFrame = undefined;
    mockUseSmoothStreaming.mockReturnValue(true);
    mockScheduleLayoutReconcile.mockClear();
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: jest.fn((callback: FrameRequestCallback) => {
        collapseFrame = callback;
        return 1;
      }),
    });
    Object.defineProperty(window, 'cancelAnimationFrame', {
      configurable: true,
      writable: true,
      value: jest.fn(),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalRequestAnimationFrame == null) {
      Reflect.deleteProperty(window, 'requestAnimationFrame');
    } else {
      window.requestAnimationFrame = originalRequestAnimationFrame;
    }
    if (originalCancelAnimationFrame == null) {
      Reflect.deleteProperty(window, 'cancelAnimationFrame');
    } else {
      window.cancelAnimationFrame = originalCancelAnimationFrame;
    }
  });

  test('renders a streaming cursor after an active tail phase', () => {
    const { container } = render(
      <ActivityPhaseGroup labelPart={labelPart} hasContent showCursor>
        <div data-testid="phase-content" />
      </ActivityPhaseGroup>,
    );

    expect(container.querySelector('.result-thinking')).toBeInTheDocument();
  });

  test('compresses visible activity into a newly streamed parent label', () => {
    render(
      <ActivityPhaseGroup labelPart={labelPart} hasContent animateEntrance>
        <div data-testid="phase-content" />
      </ActivityPhaseGroup>,
    );

    const trigger = screen.getByRole('button', { name: 'Compared both release paths' });
    const panel = screen.getByTestId('activity-phase-panel');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(panel).toHaveAttribute('aria-hidden', 'false');
    expect(trigger).toHaveClass('animate-in', 'fade-in-0', 'slide-in-from-bottom-1');

    act(() => collapseFrame?.(0));

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(panel).toHaveAttribute('aria-hidden', 'true');
    expect(mockScheduleLayoutReconcile).toHaveBeenCalledTimes(1);
  });

  test('keeps historical phases closed without replaying the entrance', () => {
    render(
      <ActivityPhaseGroup labelPart={labelPart} hasContent>
        <div data-testid="phase-content" />
      </ActivityPhaseGroup>,
    );

    const trigger = screen.getByRole('button', { name: 'Compared both release paths' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).not.toHaveClass('animate-in');
    expect(collapseFrame).toBeUndefined();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  test('honors the smooth-streaming preference', () => {
    mockUseSmoothStreaming.mockReturnValue(false);

    render(
      <ActivityPhaseGroup labelPart={labelPart} hasContent animateEntrance>
        <div data-testid="phase-content" />
      </ActivityPhaseGroup>,
    );

    const trigger = screen.getByRole('button', { name: 'Compared both release paths' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).not.toHaveClass('animate-in');
    expect(collapseFrame).toBeUndefined();
  });
});
