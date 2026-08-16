import React from 'react';
import { render, screen } from '@testing-library/react';
import ProgressText from '../ProgressText';

jest.mock('~/hooks', () => ({
  useLocalize:
    () =>
    (key: string, values?: Record<string, string | number>): string => {
      const translations: Record<string, string> = {
        com_ui_duration_seconds: `${values?.[0]}s`,
        com_ui_duration_minutes: `${values?.[0]}m ${values?.[1]}s`,
        com_ui_duration_announced_seconds: `took ${values?.count} seconds`,
        com_ui_duration_announced_seconds_one: `took ${values?.count} second`,
        com_ui_duration_announced_minutes: `took ${values?.count} minutes`,
        com_ui_duration_announced_minutes_one: `took ${values?.count} minute`,
      };
      return translations[key] ?? key;
    },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'en' } }),
}));

jest.mock('../CancelledIcon', () => ({
  __esModule: true,
  default: () => <span data-testid="cancelled-icon" />,
}));

const defaults = {
  progress: 1,
  inProgressText: 'Running foo',
  finishedText: 'Completed foo',
};

const renderProgressText = (props: Partial<React.ComponentProps<typeof ProgressText>> = {}) =>
  render(<ProgressText {...defaults} {...props} />);

describe('ProgressText duration', () => {
  it('renders the compact duration on a settled card', () => {
    renderProgressText({ durationMs: 3500 });
    expect(screen.getByText('· 3.5s')).toBeInTheDocument();
  });

  it('formats durations of a minute or more as minutes and seconds', () => {
    renderProgressText({ durationMs: 65_000 });
    expect(screen.getByText('· 1m 5s')).toBeInTheDocument();
  });

  /**
   * The number would be stale the moment it rendered, and the label beside it
   * is still the in-progress one.
   */
  it('does not render while the step is still running', () => {
    renderProgressText({ progress: 0.4, durationMs: 3500 });
    expect(screen.queryByText('· 3.5s')).not.toBeInTheDocument();
  });

  /**
   * On a cancelled or failed card the slot already carries the cancelled icon
   * or the error suffix, and "how long it took" is not the fact the reader
   * needs. The two states arrive through different props — `error` carries
   * cancellation, `errorSuffix` alone carries failure — so both are pinned
   * separately; gating on `error` alone rendered a duration beside "failed"
   * (Codex round 1 on #14892).
   */
  it('does not render on a cancelled card', () => {
    renderProgressText({ error: true, durationMs: 3500 });
    expect(screen.queryByText('· 3.5s')).not.toBeInTheDocument();
  });

  it('does not render on a failed card, where failure arrives as errorSuffix alone', () => {
    renderProgressText({ errorSuffix: 'failed', durationMs: 3500 });
    expect(screen.queryByText('· 3.5s')).not.toBeInTheDocument();
    expect(screen.queryByText('took 3.5 seconds')).not.toBeInTheDocument();
  });

  it('renders nothing when no duration was derivable', () => {
    renderProgressText({});
    expect(screen.queryByText(/took/)).not.toBeInTheDocument();
  });

  /** Sub-threshold durations are noise; the gate lives in the shared helper. */
  it('suppresses a duration too short to be worth reporting', () => {
    renderProgressText({ durationMs: 300 });
    expect(screen.queryByText('· 0.3s')).not.toBeInTheDocument();
  });

  describe('accessibility', () => {
    it('hides the compact form from assistive technology and pairs it with a spoken one', () => {
      renderProgressText({ durationMs: 3500 });
      expect(screen.getByText('· 3.5s')).toHaveAttribute('aria-hidden', 'true');
      expect(screen.getByText('took 3.5 seconds')).toHaveClass('sr-only');
    });

    it('announces the singular form for exactly one second', () => {
      renderProgressText({ durationMs: 1000 });
      expect(screen.getByText('took 1 second')).toBeInTheDocument();
    });

    it('announces whole minutes for longer steps', () => {
      renderProgressText({ durationMs: 150_000 });
      expect(screen.getByText('took 3 minutes')).toBeInTheDocument();
    });

    /** Both spans sit inside the button, so its accessible name carries the
     *  duration without an `aria-live` region re-announcing it. */
    it('keeps the duration inside the button', () => {
      renderProgressText({ durationMs: 3500 });
      expect(screen.getByRole('button')).toHaveTextContent('took 3.5 seconds');
    });
  });
});
