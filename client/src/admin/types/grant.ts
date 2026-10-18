import type { PrincipalType, ResourceType } from 'librechat-data-provider';
import type { AdminAuditLogEntry } from 'librechat-data-provider';
import type { KeyboardEvent } from 'react';

export interface AuditLogEntryWithDiff extends AdminAuditLogEntry {
  before?: readonly string[];
  after?: readonly string[];
}

/** `target.type` values the audit log can filter on: principals for grants, agents for Insights. */
export type AuditTargetType =
  | PrincipalType.USER
  | PrincipalType.GROUP
  | PrincipalType.ROLE
  | ResourceType.AGENT;

/** What an audit entry changed: a system capability, or an agent-level permission. */
export interface AuditSubject {
  label: string;
  value: string;
}

/** Principal whose agent-level permission an `permission.*` audit entry changed. */
export interface AuditGrantee {
  type: string;
  id: string;
}

export interface PrincipalRow {
  principalType: PrincipalType;
  principalId: string;
  name: string;
  grantCount: number;
  isActive: boolean;
}

export interface CapabilityPanelProps {
  capabilities: Record<string, boolean>;
  onChange: (capabilities: Record<string, boolean>) => void;
  disabled?: boolean;
}

export interface EditCapabilitiesDialogProps {
  principalType: PrincipalType | null;
  principalId: string | null;
  principalName: string;
  onClose: () => void;
}

export interface GrantsPageProps {
  activeTab: 'management' | 'audit-log';
  onTabChange: (tab: string) => void;
}

export interface GrantTableRowProps {
  row: PrincipalRow;
  isLast: boolean;
  onClick: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLTableRowElement>) => void;
  rowRef: (el: HTMLTableRowElement | null) => void;
}
