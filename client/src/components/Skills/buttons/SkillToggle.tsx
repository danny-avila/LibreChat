import { memo } from 'react';
import { Switch } from '@librechat/client';

interface SkillToggleProps {
  enabled: boolean;
  onChange: () => void;
  ariaLabel: string;
}

function SkillToggle({ enabled, onChange, ariaLabel }: SkillToggleProps) {
  return (
    <span
      onClick={(e) => e.stopPropagation()}
      className="inline-flex h-9 items-center justify-center rounded-md px-1 transition-colors hover:bg-surface-hover"
    >
      <Switch checked={enabled} onCheckedChange={() => onChange()} aria-label={ariaLabel} />
    </span>
  );
}

export default memo(SkillToggle);
