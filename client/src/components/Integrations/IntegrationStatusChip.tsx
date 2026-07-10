import React from 'react';
import type { IntegrationConnectionStatus } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface IntegrationStatusChipProps {
  status?: IntegrationConnectionStatus;
  className?: string;
}

const statusTextStyles: Record<IntegrationConnectionStatus, string> = {
  connected: 'text-green-600 dark:text-green-400',
  not_connected: 'text-text-secondary',
  expired: 'text-amber-600 dark:text-amber-400',
  revoked: 'text-red-600 dark:text-red-400',
  disabled: 'text-text-tertiary',
};

const statusDotStyles: Record<IntegrationConnectionStatus, string> = {
  connected: 'bg-green-500',
  not_connected: 'bg-text-tertiary',
  expired: 'bg-amber-500',
  revoked: 'bg-red-500',
  disabled: 'bg-text-tertiary opacity-60',
};

export function IntegrationStatusChip({
  status = 'not_connected',
  className,
}: IntegrationStatusChipProps) {
  const localize = useLocalize();

  const labelKey = {
    connected: 'com_integrations_status_connected',
    not_connected: 'com_integrations_status_not_connected',
    expired: 'com_integrations_status_expired',
    revoked: 'com_integrations_status_revoked',
    disabled: 'com_integrations_status_disabled',
  }[status] as Parameters<typeof localize>[0];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap text-xs leading-none',
        statusTextStyles[status],
        className,
      )}
    >
      <span
        className={cn('size-1.5 shrink-0 rounded-full', statusDotStyles[status])}
        aria-hidden="true"
      />
      {localize(labelKey)}
    </span>
  );
}
