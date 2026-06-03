import { DollarSign } from 'lucide-react';
import { formatUSD } from './credits';

/**
 * Full-width hero card highlighting the headline "USD consumed" figure at the top of the
 * Analytics tab. Pure presentation — `value` is in tokenCredits and formatted with formatUSD.
 */
function HeroCardUSD({ value, sublabel, label }: { value: number; sublabel: string; label: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-vermeer/20 bg-gradient-to-br from-vermeer/5 to-transparent p-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-text-secondary">{label}</p>
          <p className="text-5xl font-bold text-text-primary">{formatUSD(value)}</p>
          <p className="text-xs text-text-tertiary">{sublabel}</p>
        </div>
        <div className="hidden items-center justify-center sm:flex">
          <DollarSign className="h-20 w-20 text-vermeer/30" strokeWidth={1.5} aria-hidden="true" />
        </div>
      </div>
      <div className="absolute inset-y-0 left-0 w-1 bg-vermeer" aria-hidden="true" />
    </div>
  );
}

export default HeroCardUSD;
