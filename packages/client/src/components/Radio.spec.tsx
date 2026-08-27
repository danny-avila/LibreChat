import { render, screen } from '@testing-library/react';
import Radio from './Radio';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const FIVE = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'cron', label: 'Custom' },
];

const group = (): HTMLElement => screen.getByRole('radiogroup');

describe('Radio', () => {
  it('exposes every option as a radio and marks the selected one', () => {
    render(<Radio options={FIVE} value="weekly" aria-labelledby="lbl" />);

    expect(screen.getAllByRole('radio')).toHaveLength(5);
    expect(screen.getByRole('radio', { name: 'Weekly' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Daily' })).toHaveAttribute('aria-checked', 'false');
  });

  it('keeps the segments on one row by default', () => {
    // The default must stay exactly as it was: every existing group relies on the
    // single-row layout and its indicator stretched between the container's insets.
    render(<Radio options={FIVE} value="daily" fullWidth />);

    expect(group().className).not.toContain('flex-wrap');
  });

  it('lets the segments flow onto a second row when asked', () => {
    // Each segment has a hard minimum width (px-4 plus a whitespace-nowrap label),
    // so without this five of them overflow a phone-width dialog and the choices
    // past the edge cannot be reached.
    render(<Radio options={FIVE} value="daily" fullWidth wrap />);

    expect(group().className).toContain('flex-wrap');
  });
});
