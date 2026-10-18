import { useState, useEffect } from 'react';
import type * as t from '~/admin/types';
import { useLocalize, useExpandSignal } from '~/admin/hooks';
import { DecorativeIcon } from '~/admin/components/shared';
import { Button } from '~/admin/ui';

const REASON_KEYS: Record<t.ReadOnlySectionReason, string> = {
  baseOnly: 'com_admin_config_base_only_section',
  yamlOnly: 'com_admin_config_yaml_only_section',
  scope: 'com_admin_config_shell_scope_gated',
};

/**
 * Shell for a section the panel shows but cannot change (SH-10): a persistent
 * banner with the reason — base-only (HF-8), read only from librechat.yaml
 * (FX-10), or not per profile (PR-7, with "Edit in Base") — above the current
 * values, which the section renders as disabled controls. The banner and the
 * rows are siblings, so the rows keep the section's grid.
 */
export function ReadOnlySection({
  reason,
  title,
  message,
  detail,
  onEditInBase,
  isEmpty,
  reveal,
  children,
}: t.ReadOnlySectionProps) {
  const localize = useLocalize();
  const [showsAll, setShowsAll] = useState(reveal === true);
  /** Expand all / Collapse all unfold and fold the rows too; a field revealed inside unfolds them. */
  useExpandSignal(setShowsAll);
  useEffect(() => {
    if (reveal) setShowsAll(true);
  }, [reveal]);
  const folded = isEmpty === true && !showsAll;
  return (
    <>
      <div
        role="note"
        data-read-only={reason}
        className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-(--cui-color-stroke-default) bg-(--cui-color-background-secondary) px-3 py-2 text-sm text-(--cui-color-text-default)"
      >
        <span className="flex shrink-0 text-(--cui-color-text-muted)">
          <DecorativeIcon name="lock" size="sm" />
        </span>
        <span className="flex min-w-0 flex-[1_1_14rem] flex-col gap-0.5">
          {title && <span className="font-medium">{title}</span>}
          <span className={title ? 'text-xs text-(--settings-neutral-fg)' : undefined}>
            {message ?? localize(REASON_KEYS[reason])}
          </span>
          {detail && <span className="text-xs">{detail}</span>}
          {folded && (
            <span className="text-xs text-(--settings-neutral-fg)">
              {localize('com_admin_config_read_only_empty')}
            </span>
          )}
        </span>
        {isEmpty && (
          <button
            type="button"
            className="shrink-0 cursor-pointer border-none bg-transparent p-0 text-xs font-medium text-(--cui-color-text-link) hover:underline"
            aria-expanded={showsAll}
            onClick={() => setShowsAll((open) => !open)}
          >
            {localize(
              showsAll
                ? 'com_admin_config_read_only_hide_fields'
                : 'com_admin_config_read_only_show_fields',
            )}
          </button>
        )}
        {reason === 'scope' && onEditInBase && (
          <Button
            htmlType="button"
            type="secondary"
            label={localize('com_admin_config_shell_edit_in_base')}
            onClick={onEditInBase}
          />
        )}
      </div>
      {!folded && children}
    </>
  );
}
