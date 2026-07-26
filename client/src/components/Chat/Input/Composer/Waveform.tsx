import { memo } from 'react';
import { cn } from '~/utils';

/** Bars never collapse to nothing, so silence still reads as a live line. */
const MIN_BAR = 0.1;

/**
 * Live microphone trace. Spreads a fixed bar count across whatever width it is
 * given, so it fills its container rather than overflowing and being clipped.
 */
function Waveform({ levels, className }: { levels: number[]; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('flex w-full items-center justify-between overflow-hidden', className)}
    >
      {levels.map((level, index) => (
        <span
          key={index}
          style={{ height: `${Math.max(MIN_BAR, level) * 100}%` }}
          className="bg-text-primary/70 w-[3px] shrink-0 rounded-full transition-[height] duration-100 ease-out"
        />
      ))}
    </div>
  );
}

export default memo(Waveform);
