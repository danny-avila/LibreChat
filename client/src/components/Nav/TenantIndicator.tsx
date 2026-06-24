import { memo } from 'react';
import { Building2 } from 'lucide-react';
import { useAuthContext, useLocalize } from '~/hooks';
import { cn } from '~/utils';

type TenantIndicatorVariant = 'badge' | 'inline';

interface TenantIndicatorProps {
  variant?: TenantIndicatorVariant;
  className?: string;
}

function TenantIndicator({ variant = 'badge', className }: TenantIndicatorProps) {
  const { user } = useAuthContext();
  const localize = useLocalize();
  const tenantName = user?.tenantName?.trim();

  if (!tenantName) {
    return null;
  }

  const contextLabel = localize('com_nav_organization_context', { 0: tenantName });

  if (variant === 'inline') {
    return (
      <div className={cn('text-token-text-secondary text-sm', className)} role="note">
        <span className="sr-only">{localize('com_nav_organization')}: </span>
        <Building2 className="icon-sm mr-1.5 inline opacity-70" aria-hidden="true" />
        {tenantName}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex max-w-[220px] items-center gap-1.5 truncate rounded-full border border-border-medium bg-surface-secondary px-2.5 py-1 text-xs font-medium text-text-secondary',
        className,
      )}
      title={contextLabel}
      aria-label={contextLabel}
    >
      <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{tenantName}</span>
    </div>
  );
}

export default memo(TenantIndicator);
