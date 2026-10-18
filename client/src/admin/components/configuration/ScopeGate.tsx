import type * as t from '~/admin/types';
import { useLocalize, useScopeActions } from '~/admin/hooks';
import { getConfigSection } from '~/admin/constants';
import { ReadOnlySection } from './ReadOnlySection';
import { isSameScope } from '~/admin/utils';

const REASON_KEYS: Readonly<Record<t.ScopeGateReason, string>> = {
  baseOnly: 'com_admin_scope_gate_base_only',
  yamlOnly: 'com_admin_scope_gate_yaml_only',
  tenantWide: 'com_admin_scope_gate_tenant_wide',
  preAuth: 'com_admin_scope_gate_pre_auth',
};

/**
 * A section that cannot be set per profile while a profile is open (WS8:
 * PR-7), in the read-only section shell (WS5: SH-10): says why, points out
 * values the profile still stores there (which LibreChat ignores), offers to
 * switch to Base, and shows the section's current values read-only.
 */
export function ScopeGate({ reason, title, section, children }: t.ScopeGateProps) {
  const localize = useLocalize();
  const actions = useScopeActions();
  const editing = actions?.editingScope;
  const live = editing && actions.index.scopes.find((scope) => isSameScope(scope, editing));
  const ignored = (live?.overridePaths ?? []).filter(
    (path) => getConfigSection(path) === section,
  ).length;

  return (
    <ReadOnlySection
      reason="scope"
      title={localize('com_admin_scope_gate_title', { section: title })}
      message={localize(REASON_KEYS[reason])}
      detail={
        ignored > 0 ? localize('com_admin_scope_gate_ignored', { count: ignored }) : undefined
      }
      onEditInBase={actions ? () => actions.selectScope({ type: 'BASE' }) : undefined}
    >
      {children}
    </ReadOnlySection>
  );
}
