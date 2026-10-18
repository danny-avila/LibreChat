import { PrincipalType } from 'librechat-data-provider';
import type { AdminConfig } from 'librechat-data-provider';
import type { ComponentProps, ReactNode } from 'react';
import type { ConfigRecord, ConfigValue, SchemaField } from './config';
import type { VisibilityEdit } from './changes';
import { Dropdown, Icon } from '~/admin/ui';

export type IconName = ComponentProps<typeof Icon>['name'];
export type MenuIconName = ComponentProps<typeof Dropdown.Item>['icon'];

export interface ConfigScope {
  _id?: string;
  principalType: PrincipalType;
  principalId: string;
  /** Role name, group name or user display name (the principal id when unresolved). */
  name: string;
  /** User profiles: the user's email, shown beside the name and matched by search. */
  email?: string;
  priority: number;
  /** Members of the role or group the profile applies to. */
  memberCount?: number;
  isActive: boolean;
  /** Leaf paths the profile overrides (an array value is one leaf). */
  overridePaths?: string[];
  /**
   * Identities of the entries the profile stores in each list LibreChat merges
   * entry by entry (`endpoints.custom` → `['Claude']`): one override each.
   */
  overrideEntries?: Record<string, string[]>;
  /** Paths the profile hides from the layers below it. */
  tombstones?: string[];
}

export type ScopeSelection = { type: 'BASE' } | { type: 'SCOPE'; scope: ConfigScope };

export interface FieldProfileValue {
  scope: ConfigScope;
  value: NonNullable<ConfigValue>;
}

export interface ScopePermissions {
  canView: boolean;
  canEdit: boolean;
  /** Whether the user can create/delete scopes and manage profile values.
   *  Requires ASSIGN_CONFIGS or MANAGE_CONFIGS. Falls back to `canEdit` when
   *  not explicitly provided, preserving backwards compatibility. */
  canAssign?: boolean;
}

/** Principal types that can have config scopes (excludes PUBLIC). */
export type ScopePrincipalType = PrincipalType.ROLE | PrincipalType.GROUP | PrincipalType.USER;

export interface ScopeTypeConfigEntry {
  icon: IconName;
  /** The text color class the kind is drawn in. */
  colorClass: string;
  /** The left border class of a bar about a profile of this kind. */
  accentBorderClass: string;
  labelKey: string;
  badgeClass: string;
}

/**
 * Why a section cannot be set per profile, so in a profile it collapses into an
 * "Applies to everyone — edit in Base" card and its paths are never sent (WS8):
 * - `baseOnly`: the admin API strips it for every profile (e.g. content filters)
 * - `yamlOnly`: LibreChat reads it only from librechat.yaml (e.g. Turnstile)
 * - `tenantWide`: one tenant-wide setting with its own API (e.g. Langfuse)
 * - `preAuth`: read before sign-in, when no profile can apply (e.g. registration)
 */
export type ScopeGateReason = 'baseOnly' | 'yamlOnly' | 'tenantWide' | 'preAuth';

/** Another profile with the same priority that can apply to the same user. */
export interface ScopePriorityTie {
  scope: ConfigScope;
  /** Paths both profiles set; when non-empty, users in both get an undefined value. */
  sharedPaths: string[];
}

/** Profile lookups shared by the selector, the context bar and the field cascade. */
export interface ScopeIndex {
  scopes: ConfigScope[];
  /** Profiles that override each path or something inside it. */
  byPath: ReadonlyMap<string, ConfigScope[]>;
}

/** Page-level scope actions for components rendered deep in the form (WS8). */
export interface ScopeActions {
  /** Switches profile through the page's unsaved-changes guard. */
  selectScope: (selection: ScopeSelection) => void;
  editingScope?: ConfigScope;
}

/** What the configuration page shares with the form: scope actions plus the profile index. */
export interface ScopeContextValue extends ScopeActions {
  index: ScopeIndex;
}

export interface ScopeActionsProviderProps {
  value: ScopeActions;
  children: ReactNode;
}

export interface ScopeBarProps
  extends Pick<
    ScopeOverridesDialogProps,
    | 'values'
    | 'pendingResets'
    | 'onRevert'
    | 'onUnhide'
    | 'visibility'
    | 'fields'
    | 'config'
    | 'onRevertEntry'
    | 'isEntryPending'
  > {
  scope: ConfigScope;
  /** Switches to Base through the page's unsaved-changes guard. */
  onBackToBase: () => void;
  onError?: (message: string) => void;
}

export interface ScopeNotFoundProps {
  /** The `?scope=` value that matched no profile. */
  scopeParam: string;
  onEditBase: () => void;
  /** The profile was created; open it. */
  onCreated: (scope: ConfigScope) => void;
}

export interface ScopeGateProps {
  reason: ScopeGateReason;
  /** The section's title, named in the banner. */
  title: string;
  /** The section's config key, to count values the open profile still stores there. */
  section: string;
  /** The section's current values, rendered read-only. */
  children?: ReactNode;
}

/** One profile row in the scope selector. */
export interface ScopeRowProps {
  scope: ConfigScope;
  isSelected: boolean;
  /** Same-priority profiles that can apply to the same user. */
  ties: ScopePriorityTie[];
  onSelect: (scope: ConfigScope) => void;
  onDelete?: (scope: ConfigScope) => void;
  /** Why delete is unavailable (e.g. unsaved edits in this profile); disables the button. */
  deleteBlockedReason?: string;
  onToggleActive?: (scope: ConfigScope, isActive: boolean) => void;
  toggling?: boolean;
}

/** A role, group or user that can get a new profile, in the create picker. */
export interface ScopeCandidate {
  principalType: ScopePrincipalType;
  principalId: string;
  name: string;
  email?: string;
  description?: string;
}

/** The "Overridden by …" link on a settings row in Base, opening the field's cascade. */
export interface ScopeCascadeProps {
  fieldPath: string;
  fieldLabel: string;
  /** Profiles that override the field, lowest priority first. */
  profiles: ConfigScope[];
}

/** The cascade of one field: Base, then each profile that overrides it, in priority order. */
export interface FieldCascadeListProps {
  fieldPath: string;
  profiles: ConfigScope[];
  onOpenProfile: (scope: ConfigScope) => void;
}

/** One setting a profile changes, as listed in its overrides summary. */
export interface ScopeOverrideItem {
  /** The setting's path (an MCP server's entry path for its fields). */
  path: string;
  /** Stored leaf paths behind the item; removing the override removes each. */
  paths: string[];
  /** The profile hides the inherited value (a tombstone) instead of setting one. */
  hidden: boolean;
  /** An entry of the list at `path` the profile overrides or adds, by identity (`Claude`). */
  entry?: string;
}

export interface ScopeOverridesDialogProps {
  open: boolean;
  scope: ConfigScope;
  /** The profile's own values by path, shown beside each override. */
  values?: Record<string, ConfigValue> | null;
  /** Paths already marked for removal in this edit session. */
  pendingResets?: ReadonlySet<string>;
  onClose: () => void;
  /** Marks an override's paths for removal; the change is reviewed and saved like any edit. */
  onRevert?: (paths: string[]) => void;
  /** Marks a hidden (tombstoned) value to be shown again; reviewed and saved like any edit (SV-9). */
  onUnhide?: (path: string) => void;
  /** Pending hides and unhides of this edit session, by path. */
  visibility?: Record<string, VisibilityEdit>;
  /** The schema tree, so values read like the page shows them (units, option labels). */
  fields?: SchemaField[];
  /** The page's config (pending edits included), to find where a list entry renders. */
  config?: ConfigRecord | null;
  /** Removes the profile's override of one list entry (or the entry it added); reviewed and saved like any edit. */
  onRevertEntry?: (collectionPath: string, identity: string) => void;
  /** Whether removing the override of a list entry is already pending. */
  isEntryPending?: (collectionPath: string, identity: string) => boolean;
}

/** A config document as the admin API lists it, tombstones included. */
export type ScopeConfigDoc = AdminConfig & { tombstones?: string[] };

/** What the admin directory says about a profile's principal (name, email, members). */
export interface PrincipalDetails {
  name: string;
  email?: string;
  memberCount?: number;
}
