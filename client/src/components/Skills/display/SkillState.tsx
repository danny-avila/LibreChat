import { TriangleAlert, MousePointerClick } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@librechat/client';
import { cn } from '~/utils';

type SkillStateVariant = 'empty' | 'error';

interface SkillStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  variant?: SkillStateVariant;
  className?: string;
}

const icons: Record<SkillStateVariant, LucideIcon> = {
  empty: MousePointerClick,
  error: TriangleAlert,
};

const styles: Record<SkillStateVariant, { icon: string; wrap: string }> = {
  empty: {
    icon: 'text-text-primary',
    wrap: 'bg-surface-tertiary',
  },
  error: {
    icon: 'text-amber-500',
    wrap: 'bg-amber-500/10',
  },
};

export default function SkillState({
  title,
  description,
  actionLabel,
  onAction,
  variant = 'empty',
  className = '',
}: SkillStateProps) {
  const Icon = icons[variant];
  const style = styles[variant];

  return (
    <div className={cn('flex h-full w-full items-center justify-center px-6 py-12', className)}>
      <div className="flex max-w-sm flex-col items-center text-center">
        <div className={cn('mb-4 flex size-12 items-center justify-center rounded-xl', style.wrap)}>
          <Icon className={cn('size-6', style.icon)} aria-hidden="true" />
        </div>
        <p className="text-[15px] font-semibold text-text-primary">{title}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">{description}</p>
        {actionLabel && onAction && (
          <Button
            type="button"
            variant="outline"
            className="mt-5"
            aria-label={actionLabel}
            onClick={onAction}
          >
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
