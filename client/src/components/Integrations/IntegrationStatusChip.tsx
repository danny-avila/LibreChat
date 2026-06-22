import React from 'react';
import type { IntegrationConnectionStatus } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface IntegrationStatusChipProps {
  status?: IntegrationConnectionStatus;
  className?: string;
}

const statusStyles: Record<IntegrationConnectionStatus, string> = {
  connected: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  not_connected: 'bg-surface-secondary text-text-secondary',
  expired: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  revoked: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  disabled: 'bg-surface-secondary text-text-tertiary',
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
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        statusStyles[status],
        className,
      )}
    >
      {localize(labelKey)}
    </span>
  );
}
