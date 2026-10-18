import { useState } from 'react';
import type * as t from '~/admin/types';
import { DecorativeIcon } from '~/admin/components/shared';
import { useDismissal, useLocalize } from '~/admin/hooks';
import { getScopeTypeConfig } from '~/admin/constants';
import { Link } from '~/admin/router';
import { cn } from '~/admin/utils';

/**
 * Informational banner (VS-10): a visible info icon, AA-contrast text, an
 * optional in-app link and a dismissal that persists per `dismissKey`. The
 * scope variants announce which profile is being edited.
 */
export function InfoBanner({
  text,
  dismissible = true,
  dismissKey,
  link,
  variant = 'info',
  scopeSelection,
  onBackToBase,
}: t.InfoBannerProps) {
  const localize = useLocalize();
  const persisted = useDismissal(dismissKey);
  const [localDismissed, setLocalDismissed] = useState(false);

  const [prevKey, setPrevKey] = useState(`${variant}:${text}`);
  const key = `${variant}:${text}`;
  if (key !== prevKey) {
    setPrevKey(key);
    setLocalDismissed(false);
  }

  const dismissed = dismissKey ? persisted.dismissed : localDismissed;
  if (dismissed) return null;

  if (
    (variant === 'scope-edit' || variant === 'scope-preview') &&
    scopeSelection?.type === 'SCOPE'
  ) {
    const scope = scopeSelection.scope;
    const config = getScopeTypeConfig(scope.principalType);

    return (
      <div
        className="scope-preview-banner flex items-center gap-2 rounded-md px-3 py-2 text-sm"
        role="status"
        aria-live="polite"
      >
        <span className={cn('flex', config.colorClass)}>
          <DecorativeIcon name={config.icon} size="sm" />
        </span>
        <span className="flex-1 text-(--cui-color-text-default)">
          {localize('com_admin_scope_editing', {
            type: localize(config.labelKey),
            name: scope.name,
          })}
        </span>
        {onBackToBase && (
          <button
            type="button"
            onClick={onBackToBase}
            className="shrink-0 cursor-pointer rounded-md border border-(--cui-color-stroke-default) bg-transparent px-2.5 py-1 text-xs font-medium text-(--cui-color-text-default) transition-colors hover:bg-(--cui-color-background-hover)"
          >
            {localize('com_admin_scope_back_to_base')}
          </button>
        )}
      </div>
    );
  }

  const dismiss = dismissKey ? persisted.dismiss : () => setLocalDismissed(true);

  return (
    <div className="settings-banner" role="note">
      <span className="settings-banner-icon">
        <DecorativeIcon name="info-in-circle" size="sm" />
      </span>
      <p className="settings-banner-text">
        {text}
        {link && (
          <>
            {' '}
            <Link to={link.to} search={link.search}>
              {localize(link.labelKey)}
            </Link>
          </>
        )}
      </p>
      {dismissible && (
        <button
          type="button"
          className="settings-banner-dismiss"
          onClick={dismiss}
          aria-label={localize('com_admin_ui_dismiss')}
          title={localize('com_admin_ui_dismiss')}
        >
          <DecorativeIcon name="cross" size="sm" />
        </button>
      )}
    </div>
  );
}
