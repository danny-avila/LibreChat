import type * as t from '~/admin/types';
import { DecorativeIcon } from './DecorativeIcon';
import { useLocalize } from '~/admin/hooks';
import { cn } from '~/admin/utils';

const LABEL_KEYS: Record<t.StateChipKind, string> = {
  default: 'com_admin_config_ui_state_default',
  yaml: 'com_admin_config_ui_state_yaml',
  override: 'com_admin_config_ui_state_override',
  scope: 'com_admin_config_ui_state_scope',
  inherited: 'com_admin_config_ui_state_inherited',
  edited: 'com_admin_config_ui_state_edited',
  pendingRevert: 'com_admin_config_ui_state_pending_revert',
  error: 'com_admin_config_ui_state_error',
};

/** Pending-change kinds carry a dot so they read as "unsaved" at a glance. */
const DOTTED: ReadonlySet<t.StateChipKind> = new Set(['edited', 'pendingRevert']);

/**
 * One state marker for a settings row (VS-1): where the value comes from
 * (Default, librechat.yaml, Override, a profile, Inherited) or what is pending
 * (Edited, Pending revert, Error). Edited and pending chips can offer Undo.
 */
export function StateChip({ kind, label, description, onUndo, undoLabel }: t.StateChipProps) {
  const localize = useLocalize();
  const text = label ?? localize(LABEL_KEYS[kind]);

  return (
    <span className="inline-flex items-center gap-1" data-state-chip={kind}>
      <span className={cn('state-chip', `state-chip-${kind}`)} title={description}>
        {DOTTED.has(kind) && <span className="state-chip-dot" aria-hidden="true" />}
        {text}
        {description && <span className="sr-only">{`, ${description}`}</span>}
      </span>
      {onUndo && (
        <button
          type="button"
          className="state-chip-undo"
          onClick={onUndo}
          aria-label={undoLabel}
          title={undoLabel}
        >
          <DecorativeIcon name="history" size="xs" />
          {localize('com_admin_config_ui_undo')}
        </button>
      )}
    </span>
  );
}
