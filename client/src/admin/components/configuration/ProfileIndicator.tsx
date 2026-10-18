import { useState } from 'react';
import type * as t from '~/admin/types';
import { useLocalize, useScopeActions } from '~/admin/hooks';
import { FieldProfilePopover } from './FieldProfilePopover';
import { getScopeTypeConfig } from '~/admin/constants';
import { formatScopeName } from '~/admin/utils';
import { Dialog, Icon } from '~/admin/ui';
import { cn } from '~/admin/utils';

/**
 * "Overridden for USER" / "Overridden in 3 profiles" on a settings row in
 * Base; opens the field's cascade so admins see who gets a different value
 * before they edit the base one (WS8: PR-8).
 */
export function ProfileIndicator({ fieldPath, fieldLabel, profiles }: t.ScopeCascadeProps) {
  const localize = useLocalize();
  const actions = useScopeActions();
  const [open, setOpen] = useState(false);
  const types = [...new Set(profiles.map((scope) => scope.principalType))];
  const label =
    profiles.length === 1
      ? localize('com_admin_scope_overridden_one', { name: formatScopeName(profiles[0]) })
      : localize('com_admin_scope_overridden_many', { count: profiles.length });

  const openProfile = (scope: t.ConfigScope) => {
    setOpen(false);
    actions?.selectScope({ type: 'SCOPE', scope });
  };

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="inline-flex max-w-full cursor-pointer items-center gap-1 self-start text-xs text-(--cui-color-text-link) hover:underline"
      >
        {types.map((type) => {
          const config = getScopeTypeConfig(type);
          return (
            <span key={type} aria-hidden="true" className={cn('shrink-0', config.colorClass)}>
              <Icon name={config.icon} size="xs" />
            </span>
          );
        })}
        <span className="truncate">{label}</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <Dialog.Content
          title={localize('com_admin_scope_cascade_heading', { field: fieldLabel })}
          showClose
          onClose={() => setOpen(false)}
        >
          <FieldProfilePopover
            fieldPath={fieldPath}
            profiles={profiles}
            onOpenProfile={openProfile}
          />
        </Dialog.Content>
      </Dialog>
    </>
  );
}
