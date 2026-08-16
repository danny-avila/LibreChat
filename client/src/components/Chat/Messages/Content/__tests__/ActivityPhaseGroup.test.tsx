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
  const expandCollapse = jest.requireActual('~/hooks/Messages/useExpandCollapse');
  const lazyCollapseBody = jest.requireActual('~/hooks/Messages/useLazyCollapseBody');
  return {
    useExpandCollapse: expandCollapse.default,
    useLazyCollapseBody: lazyCollapseBody.default,
    EXPAND_TRANSITION: expandCollapse.EXPAND_TRANSITION,
    scheduleMessageContentLayoutReconcile: (target: HTMLElement | null) =>
      mockScheduleLayoutReconcile(target),
  };
});

const LABEL = 'Compared both release paths';

const labelPart = {
  type: ContentTypes.ACTIVITY_LABEL,
  [ContentTypes.ACTIVITY_LABEL]: LABEL,
  activity_label_type: 'phase',
  activity_start_index: 0,
  pending: false,
} as unknown as Extract<TMessageContentParts, { type: ContentTypes.ACTIVITY_LABEL }>;

describe('ActivityPhaseGroup', () => {
  let frames: Array<FrameRequestCallback | undefined>;
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalCancelAnimationFrame = window.cancelAnimationFrame;

  /** The fold waits for a painted start value, so it spans more than one
   *  frame. Drain the queue the way a real compositor would. */
  const flushFrames = () =>
    act(() => {
      for (let index = 0; index < frames.length; index += 1) {
        const frame = frames[index];
        frames[index] = undefined;
        frame?.(index);
      }
    });

  const pendingFrames = () => frames.filter((frame) => frame != null).length;

  beforeEach(() => {
    frames = [];
    mockUseSmoothStreaming.mockReturnValue(true);
    mockScheduleLayoutReconcile.mockClear();
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: jest.fn((callback: FrameRequestCallback) => frames.push(callback)),
    });
    Object.defineProperty(window, 'cancelAnimationFrame', {
      configurable: true,
      writable: true,
      value: jest.fn((handle: number) => {
        frames[handle - 1] = undefined;
      }),
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

  test('renders the label flush left with no leading glyph', () => {
    render(
      <ActivityPhaseGroup labelPart={labelPart} hasContent>
        <div data-testid="phase-content" />
      </ActivityPhaseGroup>,
    );

    const trigger = screen.getByRole('button', { name: LABEL });
    expect(trigger).toHaveClass('justify-start', 'text-left');
    expect(screen.getByText(LABEL)).toHaveClass('flex-1', 'text-left');
    expect(trigger.querySelectorAll('svg')).toHaveLength(1);
  });

  test('mounts in the pre-marker shape, then folds the activity into the summary', () => {
    const { container } = render(
      <ActivityPhaseGroup labelPart={labelPart} hasContent animateEntrance>
        <div data-testid="phase-content" />
      </ActivityPhaseGroup>,
    );

    const card = container.querySelector('.my-2') as HTMLElement;
    const trigger = screen.getByRole('button', { name: LABEL });
    const header = trigger.parentElement?.parentElement as HTMLElement;
    const panel = screen.getByTestId('activity-phase-panel');

    /** Frame zero must be indistinguishable from the layout the marker
     *  replaced: no chrome, no header height, activity still open. */
    expect(card).toHaveClass('border-transparent');
    expect(card).not.toHaveClass('bg-surface-secondary/40');
    expect(header).toHaveStyle({ gridTemplateRows: '0fr', opacity: '0' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(panel).toHaveAttribute('aria-hidden', 'false');

    flushFrames();

    expect(header).toHaveStyle({ gridTemplateRows: '1fr', opacity: '1' });
    expect(card).toHaveClass('border-border-light', 'bg-surface-secondary/40');
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

    const trigger = screen.getByRole('button', { name: LABEL });
    const header = trigger.parentElement?.parentElement as HTMLElement;
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(header.getAttribute('style')).toBeNull();
    expect(pendingFrames()).toBe(0);

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  test('honors the smooth-streaming preference', () => {
    mockUseSmoothStreaming.mockReturnValue(false);

    const { container } = render(
      <ActivityPhaseGroup labelPart={labelPart} hasContent animateEntrance>
        <div data-testid="phase-content" />
      </ActivityPhaseGroup>,
    );

    const trigger = screen.getByRole('button', { name: LABEL });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(container.querySelector('.my-2')).toHaveClass('border-border-light');
    expect(pendingFrames()).toBe(0);
  });

  test('a click during the entrance wins over the scheduled fold', () => {
    render(
      <ActivityPhaseGroup labelPart={labelPart} hasContent animateEntrance>
        <div data-testid="phase-content" />
      </ActivityPhaseGroup>,
    );

    const trigger = screen.getByRole('button', { name: LABEL });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    flushFrames();

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  test('a phase without activity renders a label-only header', () => {
    render(
      <ActivityPhaseGroup labelPart={labelPart} hasContent={false} animateEntrance>
        <div data-testid="phase-content" />
      </ActivityPhaseGroup>,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(LABEL)).toHaveClass('text-left');
    expect(pendingFrames()).toBe(0);
  });

  test('keeps a collapsed history phase body unmounted until expanded', () => {
    render(
      <ActivityPhaseGroup labelPart={labelPart} hasContent>
        <div data-testid="phase-content" />
      </ActivityPhaseGroup>,
    );

    expect(screen.queryByTestId('phase-content')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: LABEL }));
    expect(screen.getByTestId('phase-content')).toBeInTheDocument();
  });

  test('releases the body only after the collapse transition completes', () => {
    render(
      <ActivityPhaseGroup labelPart={labelPart} hasContent>
        <div data-testid="phase-content" />
      </ActivityPhaseGroup>,
    );

    const trigger = screen.getByRole('button', { name: LABEL });
    fireEvent.click(trigger);
    expect(screen.getByTestId('phase-content')).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.getByTestId('phase-content')).toBeInTheDocument();

    fireEvent.transitionEnd(screen.getByTestId('activity-phase-panel'));
    expect(screen.queryByTestId('phase-content')).not.toBeInTheDocument();
  });

  test('a pending approval retains the collapsed body until it resolves', () => {
    const { rerender } = render(
      <ActivityPhaseGroup labelPart={labelPart} hasContent hasPendingApproval>
        <div data-testid="phase-content" />
      </ActivityPhaseGroup>,
    );

    const trigger = screen.getByRole('button', { name: LABEL });
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    fireEvent.transitionEnd(screen.getByTestId('activity-phase-panel'));
    expect(screen.getByTestId('phase-content')).toBeInTheDocument();

    rerender(
      <ActivityPhaseGroup labelPart={labelPart} hasContent hasPendingApproval={false}>
        <div data-testid="phase-content" />
      </ActivityPhaseGroup>,
    );
    expect(screen.queryByTestId('phase-content')).not.toBeInTheDocument();
  });

  test('the entrance fold keeps the body mounted, then releases it after settling', () => {
    render(
      <ActivityPhaseGroup labelPart={labelPart} hasContent animateEntrance>
        <div data-testid="phase-content" />
      </ActivityPhaseGroup>,
    );

    expect(screen.getByTestId('phase-content')).toBeInTheDocument();

    flushFrames();
    flushFrames();

    fireEvent.transitionEnd(screen.getByTestId('activity-phase-panel'));
    expect(screen.queryByTestId('phase-content')).not.toBeInTheDocument();
  });
});
