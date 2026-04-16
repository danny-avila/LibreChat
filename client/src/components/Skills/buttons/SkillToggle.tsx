import { memo } from 'react';
import { cn } from '~/utils';

interface SkillToggleProps {
  enabled: boolean;
  onChange: () => void;
  label?: string;
  ariaLabel: string;
  tabIndex?: number;
}

function SkillToggle({ enabled, onChange, label, ariaLabel, tabIndex }: SkillToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={ariaLabel}
      tabIndex={tabIndex}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={cn(
        'flex items-center gap-1.5 transition-colors',
        label && 'rounded-md px-2 py-1 text-xs font-medium hover:bg-surface-hover',
      )}
    >
      <span
        className={cn(
          'relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors duration-200',
          enabled ? 'bg-green-500' : 'bg-border-medium',
        )}
      >
        <span
          className={cn(
            'pointer-events-none mt-0.5 inline-block size-3 rounded-full bg-white shadow-sm transition-transform duration-200',
            enabled ? 'translate-x-3.5' : 'translate-x-0.5',
          )}
        />
      </span>
      {label && (
        <span className={enabled ? 'text-text-primary' : 'text-text-tertiary'}>{label}</span>
      )}
    </button>
  );
}

export default memo(SkillToggle);
