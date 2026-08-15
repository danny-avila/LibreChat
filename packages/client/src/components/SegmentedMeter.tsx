import * as React from 'react';
import { cn } from '~/utils';

/** Static class lookups — Tailwind cannot see an interpolated `bg-series-${n}`. */
const SERIES_FILL = [
  'bg-series-1',
  'bg-series-2',
  'bg-series-3',
  'bg-series-4',
  'bg-series-5',
  'bg-series-6',
  'bg-series-7',
] as const;

const SERIES_TINT = [
  'bg-series-1/25',
  'bg-series-2/25',
  'bg-series-3/25',
  'bg-series-4/25',
  'bg-series-5/25',
  'bg-series-6/25',
  'bg-series-7/25',
] as const;

const SERIES_EDGE = [
  'ring-series-1',
  'ring-series-2',
  'ring-series-3',
  'ring-series-4',
  'ring-series-5',
  'ring-series-6',
  'ring-series-7',
] as const;

export const SERIES_SLOT_COUNT: number = SERIES_FILL.length;

/** Wraps out-of-range slots so a caller can never render an untinted segment. */
const slotIndex = (slot: number): number =>
  (((Math.trunc(slot) - 1) % SERIES_SLOT_COUNT) + SERIES_SLOT_COUNT) % SERIES_SLOT_COUNT;

export interface MeterSegment {
  /** Stable identity for keys; also the legend key's pairing id */
  id: string;
  value: number;
  /** 1-based slot in the categorical series scale */
  slot: number;
  /** Same hue, hatched — present but held out of the active set */
  hatched?: boolean;
  /** Translucent fill with a solid edge, for the one segment that grows */
  outlined?: boolean;
}

/** A hatch can't be expressed with semantic utilities; the stripe colour is
 *  still read from the theme at paint time so it follows every theme. */
const hatchStyle = (spacing: string): React.CSSProperties => ({
  backgroundImage: `repeating-linear-gradient(135deg, transparent 0 ${spacing}, rgb(var(--surface-tertiary)) ${spacing} calc(${spacing} + 2px))`,
});

export function seriesSwatchClass(segment: Pick<MeterSegment, 'slot' | 'outlined'>): string {
  const index = slotIndex(segment.slot);
  return segment.outlined
    ? cn(SERIES_TINT[index], 'ring-1 ring-inset', SERIES_EDGE[index])
    : SERIES_FILL[index];
}

/** The legend key. Lives beside the meter so a row and its segment cannot drift. */
export interface MeterSwatchProps extends React.ComponentPropsWithoutRef<'span'> {
  segment: Pick<MeterSegment, 'slot' | 'hatched' | 'outlined'>;
}

export function MeterSwatch({
  segment,
  className,
  ...props
}: MeterSwatchProps): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      className={cn('size-2 flex-none rounded-sm', seriesSwatchClass(segment), className)}
      style={segment.hatched ? hatchStyle('1.5px') : undefined}
      {...props}
    />
  );
}

export interface SegmentedMeterProps extends React.ComponentPropsWithoutRef<'div'> {
  segments: MeterSegment[];
  /** Denominator for every segment width; the shortfall renders as free track */
  max: number;
}

/**
 * A part-to-whole meter: one tinted segment per series, free space left as
 * bare track. Every non-zero segment keeps a 2px floor so a category that is
 * present cannot render as nothing; the shortfall is absorbed by free space,
 * never by a neighbouring category.
 */
export const SegmentedMeter: React.ForwardRefExoticComponent<
  SegmentedMeterProps & React.RefAttributes<HTMLDivElement>
> = React.forwardRef<HTMLDivElement, SegmentedMeterProps>(
  ({ segments, max, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex h-2 w-full gap-[2px] overflow-hidden rounded-full bg-surface-tertiary',
        className,
      )}
      {...props}
    >
      {segments.map((segment) => {
        if (segment.value <= 0) {
          return null;
        }
        return (
          <div
            key={segment.id}
            aria-hidden="true"
            className={cn(
              'h-full min-w-[2px] transition-[width] duration-300 motion-reduce:transition-none',
              seriesSwatchClass(segment),
            )}
            style={{
              width: `${Math.min((segment.value / max) * 100, 100)}%`,
              ...(segment.hatched ? hatchStyle('2.5px') : undefined),
            }}
          />
        );
      })}
    </div>
  ),
);
SegmentedMeter.displayName = 'SegmentedMeter';
