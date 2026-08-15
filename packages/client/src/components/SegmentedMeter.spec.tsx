import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type { MeterSegment } from './SegmentedMeter';
import { SegmentedMeter, MeterSwatch, SERIES_SLOT_COUNT } from './SegmentedMeter';

const segments: MeterSegment[] = [
  { id: 'a', value: 500, slot: 1, outlined: true },
  { id: 'b', value: 250, slot: 2 },
  { id: 'c', value: 10, slot: 2, hatched: true },
];

const renderMeter = (props: Partial<React.ComponentProps<typeof SegmentedMeter>> = {}) =>
  render(<SegmentedMeter segments={segments} max={1000} data-testid="meter" {...props} />);

const children = () => Array.from(screen.getByTestId('meter').children) as HTMLElement[];

describe('SegmentedMeter', () => {
  it('sizes each segment against max and leaves the shortfall as bare track', () => {
    renderMeter();

    expect(children().map((child) => child.style.width)).toEqual(['50%', '25%', '1%']);
    expect(screen.getByTestId('meter')).toHaveClass('bg-surface-tertiary');
  });

  it('floors every rendered segment so a present category cannot vanish', () => {
    renderMeter({ segments: [{ id: 'tiny', value: 1, slot: 3 }], max: 1_000_000 });

    expect(children()[0]).toHaveClass('min-w-[2px]');
  });

  it('drops segments that contribute nothing', () => {
    renderMeter({
      segments: [
        { id: 'a', value: 0, slot: 1 },
        { id: 'b', value: -5, slot: 2 },
        { id: 'c', value: 5, slot: 3 },
      ],
    });

    expect(children()).toHaveLength(1);
    expect(children()[0]).toHaveClass('bg-series-3');
  });

  it('never lets a segment exceed the full track', () => {
    renderMeter({ segments: [{ id: 'over', value: 5000, slot: 1 }], max: 1000 });

    expect(children()[0].style.width).toBe('100%');
  });

  it('renders the outlined variant as a tint plus a solid edge', () => {
    renderMeter();

    expect(children()[0]).toHaveClass('bg-series-1/25');
    expect(children()[0]).toHaveClass('ring-1', 'ring-inset', 'ring-series-1');
    expect(children()[1]).toHaveClass('bg-series-2');
    expect(children()[1].className).not.toContain('ring-series');
  });

  it('hatches without changing the slot, and reads the stripe from the theme', () => {
    renderMeter();

    const [, solid, hatched] = children();

    expect(hatched).toHaveClass('bg-series-2');
    expect(solid.style.backgroundImage).toBe('');
    expect(hatched.style.backgroundImage).toContain('repeating-linear-gradient');
    expect(hatched.style.backgroundImage).toContain('var(--surface-tertiary)');
    /** A literal colour here would not follow a theme swap. */
    expect(hatched.style.backgroundImage).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  it('wraps slots past the end of the scale instead of rendering untinted', () => {
    renderMeter({
      segments: [
        { id: 'wrap', value: 1, slot: SERIES_SLOT_COUNT + 1 },
        { id: 'zero', value: 1, slot: 0 },
      ],
    });

    expect(children()[0]).toHaveClass('bg-series-1');
    expect(children()[1]).toHaveClass(`bg-series-${SERIES_SLOT_COUNT}`);
  });

  it('leaves the accessible description to the caller', () => {
    renderMeter({ role: 'progressbar', 'aria-valuenow': 75, 'aria-label': 'Context usage' });

    const meter = screen.getByRole('progressbar', { name: 'Context usage' });

    expect(meter).toHaveAttribute('aria-valuenow', '75');
    children().forEach((child) => expect(child).toHaveAttribute('aria-hidden', 'true'));
  });
});

describe('MeterSwatch', () => {
  it('paints the same treatment as the segment it keys', () => {
    render(
      <>
        <MeterSwatch segment={{ slot: 1, outlined: true }} data-testid="outlined" />
        <MeterSwatch segment={{ slot: 2, hatched: true }} data-testid="hatched" />
        <MeterSwatch segment={{ slot: 3 }} data-testid="plain" />
      </>,
    );

    expect(screen.getByTestId('outlined')).toHaveClass('bg-series-1/25', 'ring-series-1');
    expect(screen.getByTestId('hatched')).toHaveClass('bg-series-2');
    expect(screen.getByTestId('hatched').style.backgroundImage).toContain(
      'var(--surface-tertiary)',
    );
    expect(screen.getByTestId('plain')).toHaveClass('bg-series-3');
    expect(screen.getByTestId('plain').style.backgroundImage).toBe('');
  });
});
