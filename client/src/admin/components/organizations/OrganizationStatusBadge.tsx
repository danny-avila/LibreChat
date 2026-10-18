import { OrganizationLifecycle } from 'librechat-data-provider';
import type { BadgeState } from '~/admin/ui';
import { useLocalize } from '~/admin/hooks';
import { Badge } from '~/admin/ui';

const STATUSES: Record<string, { state: BadgeState; labelKey: string }> = {
  [OrganizationLifecycle.ACTIVE]: { state: 'success', labelKey: 'com_admin_orgs_status_active' },
  [OrganizationLifecycle.SUSPENDED]: {
    state: 'warning',
    labelKey: 'com_admin_orgs_status_suspended',
  },
  [OrganizationLifecycle.DELETING]: { state: 'danger', labelKey: 'com_admin_orgs_status_deleting' },
};

export function OrganizationStatusBadge({ status }: { status: string }) {
  const localize = useLocalize();
  const known = STATUSES[status] ?? STATUSES[OrganizationLifecycle.ACTIVE];
  return <Badge state={known.state} text={localize(known.labelKey)} />;
}
