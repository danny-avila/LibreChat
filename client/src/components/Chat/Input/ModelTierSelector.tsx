import { useState } from 'react';
import { cn } from '~/utils';

const tiers = [
  { id: 'budget', label: 'Budget', credits: 1 },
  { id: 'standard', label: 'Standard', credits: 2 },
  { id: 'premium', label: 'Premium', credits: 3 },
  { id: 'thinking', label: 'Thinking', credits: 5 },
] as const;

export default function ModelTierSelector() {
  const [selected, setSelected] = useState<string>('standard');

  return (
    <div className="flex items-center justify-center gap-2 py-2">
      {tiers.map((tier) => (
        <button
          key={tier.id}
          onClick={() => setSelected(tier.id)}
          className={cn(
            'rounded-2xl px-3 py-1 text-[10px] font-medium transition-colors',
            selected === tier.id
              ? 'bg-[--tier-selected-bg] text-[--tier-selected-text]'
              : 'border border-[--tier-border] text-[--tier-text] hover:text-text-primary',
          )}
        >
          {`${tier.label} (${tier.credits} cr)`}
        </button>
      ))}
    </div>
  );
}
