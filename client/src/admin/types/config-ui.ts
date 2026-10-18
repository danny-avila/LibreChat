import type { ReactNode } from 'react';
import type {
  ConfigValue,
  ConfigRecord,
  ControlWidth,
  FlatConfigMap,
  SchemaField,
  ReadOnlyReason,
  SkipReason,
  FieldValidationError,
} from './config';
import type { ConfigScope, ScopeGateReason, ScopeSelection, ScopePermissions } from './scope';
import type { TocEntry, JumpTarget, ConfigSearchHit, ConfigSearchItem } from './shell';
import type { BaseOverridesState, ImportSkippedKey, ImportRequest } from './review';
import type { TabBadge, PathIndex, ValueLayers } from './values';
import type { VisibilityEdit } from './changes';

export interface ConfigTab {
  id: string;
  labelKey: string;
  permission?: string;
}

export interface TocItem {
  id: string;
  label: string;
  /** Config path prefix for configured-only filtering. Falls back to
   *  stripping "section-" from `id` if not set. */
  dataPath?: string;
  /** Data path the entry reveals when clicked (WS5). */
  path?: string;
}

export interface ConfigSectionConfig {
  id: string;
  titleKey: string;
  descriptionKey?: string;
  learnMoreUrl?: string;
  icon?: string;
  fields: SchemaField[];
  sectionField?: SchemaField;
  /** When set, use this key for config value lookup and field path prefixing
   *  instead of `id`. Used by virtual sections that share another section's
   *  schema data but render under a different tab/renderer. */
  schemaKey?: string;
  /** When set, the TOC renders these items instead of deriving children from
   *  the schema fields. Used by tabs like Custom Endpoints where the TOC
   *  should show configured entry names rather than field structure. */
  tocItems?: TocItem[];
  /** Optional info banner displayed at the top of the section content. */
  bannerText?: string;
  /** Link shown after the banner text (e.g. to Access › Roles). */
  bannerLink?: InfoBannerLink;
  /** Literal title for sections without a locale key (e.g. newer schema sections). */
  title?: string;
  /** Set for sections the panel must not write; the section renders read-only. */
  readOnlyReason?: ReadOnlyReason;
  /** Set in a profile for sections that apply to everyone; they render as an "edit in Base" card (WS8). */
  scopeGate?: ScopeGateReason;
  /** The section is a record keyed by entry name, so its keys are entries, not settings. */
  isRecord?: boolean;
}

export interface ConfigPageProps {
  initialTab?: string;
  /** `?field=`: data path to reveal and focus once the tab has rendered. */
  highlightField?: string;
  /** `?scope=`: the open profile; the URL is the single source of truth. */
  initialScope?: string;
  /** `?customized=1`: show only customized settings. */
  customizedOnly?: boolean;
}

export interface ConfigTabBarProps {
  tabs: ConfigTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  /** Badge per tab: "1 spec", "3 customized", and a dot while it has unsaved edits (WS4). */
  tabBadges?: Record<string, TabBadge>;
  children?: ReactNode;
}

/** Section key → whether the viewer can read and manage that section. */
export type SectionPermissionMap = Record<string, Pick<ScopePermissions, 'canView' | 'canEdit'>>;

export interface ConfigTabContentProps {
  sections: ConfigSectionConfig[];
  configValues: Record<string, ConfigValue> | null;
  editedValues: FlatConfigMap;
  onFieldChange: (path: string, value: ConfigValue) => void;
  onResetField?: (path: string) => void;
  /** See `SingleFieldRendererProps.onDiscardField`. */
  onDiscardField?: (path: string) => void;
  previewMode?: boolean;
  previewScope?: ConfigScope;
  previewChangedPaths?: string[] | null;
  resolvedValues?: FlatConfigMap | null;
  permissions?: ScopePermissions;
  showChangedOnly?: boolean;
  readOnly?: boolean;
  configuredPaths?: Set<string>;
  dbOverridePaths?: Set<string>;
  /** Overridden entries of keyed lists (`ConfigLayers.listOverrideCounts`), for section badges. */
  listOverrideCounts?: ReadonlyMap<string, number>;
  touchedPaths?: Set<string>;
  pendingResets?: Set<string>;
  sectionPermissions?: Record<string, { canView: boolean; canEdit: boolean }>;
  schemaDefaults?: FlatConfigMap;
  showConfiguredOnly?: boolean;
  isEditingScope?: boolean;
  /** YAML-defined entry keys per section, keyed by parent path. */
  baseRecordKeys?: Record<string, Set<string>>;
  onValidationError?: (message: string) => void;
  /** See `SingleFieldRendererProps.editSessionId`. */
  editSessionId?: number;
  /** Top-level config object whose schema-unknown keys are listed read-only after the sections. */
  unknownSettings?: Pick<UnknownSettingsProps, 'fields' | 'value'>;
  /** The value layers fields derive provenance and revert targets from (WS4). */
  valueLayers?: ValueLayers | null;
  /** Pending profile Hide/Unhide, shown on their rows before Save. */
  visibilityEdits?: Readonly<Record<string, VisibilityEdit>>;
  /** While the tab filter is active: the sections holding a match (WS5). */
  visibleSectionIds?: Set<string>;
  /** While the tab filter is active: the data paths that match; other rows are hidden (WS5). */
  filterPaths?: PathIndex;
  /** The tab filter text, for the no-match empty state (WS5). */
  filterText?: string;
  onClearFilter?: () => void;
  /** Turns "Set values only" off from its empty state (WS5). */
  onShowAll?: () => void;
}

export interface ConfigTableOfContentsProps {
  /** The tab's entries (`buildTocEntries`), narrowed to the tab filter's matches. */
  entries: TocEntry[];
  scrollContainer: HTMLElement | null;
  tocRef: (el: HTMLElement | null) => void;
  showConfiguredOnly?: boolean;
  configuredPaths?: Set<string>;
  onNavigate?: (sectionId: string) => void;
  /** Paths with pending edits: their sections and entries get a dirty marker (WS5). */
  dirtyPaths?: string[];
  /** Paths with blocking errors: their sections and entries get an error marker (WS5). */
  errorPaths?: string[];
}

export interface ConfigRowProps {
  title: string;
  description?: string;
  learnMoreUrl?: string;
  badge?: ReactNode;
  children: ReactNode;
  disabled?: boolean;
  hidden?: boolean;
  fieldId?: string;
  fieldPath?: string;
  previewMode?: boolean;
  previewScope?: ConfigScope;
  previewChangedPaths?: string[] | null;
  resolvedValues?: FlatConfigMap | null;
  permissions?: ScopePermissions;
  onResetField?: (path: string) => void;
  isConfigured?: boolean;
  isDbOverride?: boolean;
  isTouched?: boolean;
  isPendingReset?: boolean;
  defaultHint?: string | null;
  /** Discards the row's pending edit or reset (the Undo action on the Edited chip). */
  onDiscardField?: (path: string) => void;
  /** Overrides the inferred control width (VS-6); `FieldMeta.width` is used first. */
  controlWidth?: ControlWidth;
  required?: boolean;
  /** Inline validation message; falls back to `FieldState.error`. */
  error?: string;
}

/**
 * Layout slots of one settings row (WS6 owns the layout; WS3 fills the slots).
 * Renders the shared grid `label | control | trailing`: the label column holds
 * the label, hint and description; the control column holds the control and
 * its error; the trailing column holds chips and actions. Below 560px of
 * container width (or a 640px viewport) the label stacks above the control.
 */
export interface SettingsRowProps {
  label: string;
  /** Id of the control the label is for. The error is rendered as `${htmlFor}-error`. */
  htmlFor?: string;
  description?: string;
  learnMoreUrl?: string;
  control: ReactNode;
  /** State chips (provenance, edited, error) in the trailing column. */
  chips?: ReactNode;
  /** Secondary line under the label (e.g. the default-value hint). */
  hint?: ReactNode;
  /** Row actions after the chips (reset, undo, profile badges). */
  actions?: ReactNode;
  /** Inline validation message, rendered under the control (errors map from WS1). */
  error?: ReactNode;
  /** Marks the label as required with a `*`. */
  required?: boolean;
  /** Control width token (VS-6): S numbers, M identifiers, L URLs and prompts; unset sizes by control type. */
  width?: ControlWidth;
  /** Left-edge marker for a pending edit, a pending revert or an error. */
  marker?: SettingsRowMarker;
}

/** Left-edge marker of a settings row. */
export type SettingsRowMarker = 'edited' | 'pending' | 'error';

/** A section's badge count: settings with a value out of all, or the entries of a collection. */
export interface SectionCount {
  total: number;
  configured: number;
  /** The section is one collection (custom endpoints, MCP servers): `total` counts its entries. */
  entries?: boolean;
  /** Settings (or entries) the admin overrides in Base; 0 in a profile, where every set value is its own. */
  overrides?: number;
}

export interface ConfigSectionProps {
  sectionId?: string;
  title: string;
  description?: string;
  learnMoreUrl?: string;
  children: ReactNode;
  hidden?: boolean;
  configuredCount?: number;
  totalCount?: number;
  /** `totalCount` counts the entries of a collection, not settings. */
  countsEntries?: boolean;
  /** Admin overrides among them (Base only). */
  overrideCount?: number;
  defaultExpanded?: boolean;
  inline?: boolean;
  showConfiguredOnly?: boolean;
}

export interface ContentToolbarProps {
  scrollContainer: HTMLElement | null;
  /** "Filter this tab…" text. */
  filter: string;
  onFilterChange: (value: string) => void;
  filterHits?: ConfigSearchHit[];
  onFilterSelect?: (item: ConfigSearchItem) => void;
  /** `?customized=1`. */
  customizedOnly: boolean;
  onCustomizedOnlyChange: (value: boolean) => void;
  /** Nothing is customized in the open scope; the checkbox stays enabled while checked. */
  nothingCustomized: boolean;
  /** "Jump to…" entries, shown below xl where the table of contents is hidden. */
  jumpTargets?: JumpTarget[];
  onJump?: (id: string) => void;
}

export interface HeaderActionsProps {
  /** Label of the reset button (defaults to "Reset to default"). */
  resetLabel?: string;
  showImport: boolean;
  importDisabled: boolean;
  importTitle?: string;
  onImportClick: () => void;
  showReset: boolean;
  resetDisabled: boolean;
  resetTitle?: string;
  onResetClick: () => void;
  showScope: boolean;
  scopeSelection: ScopeSelection;
  /** The profile a `?scope=` link names is still being looked up. */
  scopeLoading?: boolean;
  scopeUnavailable?: boolean;
  onScopeClick: () => void;
}

export interface ResetBaseConfigDialogProps {
  open: boolean;
  resetting: boolean;
  error?: string | null;
  /** The overrides the reset removes, listed with what each setting reverts to (WS7). */
  overrides?: BaseOverridesState;
  onConfirm: () => void;
  onCancel: () => void;
}

export interface SingleFieldRendererProps {
  field: SchemaField;
  value: ConfigValue;
  path: string;
  getValue: (path: string, fallback: ConfigValue) => ConfigValue;
  onChange: (path: string, value: ConfigValue) => void;
  onResetField?: (path: string) => void;
  /**
   * Removes `path` from `editedValues`/`touchedPaths` directly, bypassing
   * the baseline-match diffing `onChange` goes through. Used by SecretField's
   * Cancel: abandoning an in-progress replacement is never a real edit, so it
   * must not be representable as a pending reset (`onChange(path, undefined)`)
   * whenever a scope-resolved baseline happens to also read as empty.
   */
  onDiscardField?: (path: string) => void;
  /**
   * Source of truth for whether a secret field currently has a queued
   * replacement (`SecretField`'s `hasPendingEdit`). Membership in this map,
   * not `touchedPaths`, since a replacement typed then cleared back to a
   * baseline that itself reads as an empty string gets removed from here by
   * `applyConfigEdit`'s baseline-match diffing, while `touchedPaths` keeps
   * the path forever — using the latter would keep showing an open, empty
   * replace input for a field with nothing actually queued to save.
   */
  editedValues?: FlatConfigMap;
  disabled?: boolean;
  permissions?: ScopePermissions;
  previewMode?: boolean;
  previewScope?: ConfigScope;
  previewChangedPaths?: string[] | null;
  resolvedValues?: FlatConfigMap | null;
  configuredPaths?: Set<string>;
  dbOverridePaths?: Set<string>;
  touchedPaths?: Set<string>;
  pendingResets?: Set<string>;
  schemaDefaults?: FlatConfigMap;
  showConfiguredOnly?: boolean;
  isSoleField?: boolean;
  /** Masked preview of a set-but-redacted secret, from the sibling `<field>Preview` companion. */
  secretPreviewValue?: string;
  /**
   * Bumped by the parent on Discard, a successful save, a confirmed scope
   * change, or a reset-to-default success — every bulk `editedValues`/
   * `touchedPaths` clear. Used as part of `SecretField`'s `key` so an
   * in-progress (possibly untyped) replacement doesn't survive past the
   * edit session that started it.
   */
  editSessionId?: number;
}

export interface FieldRendererProps {
  fields: SchemaField[];
  parentValue: ConfigValue;
  parentPath: string;
  getValue: (path: string, fallback: ConfigValue) => ConfigValue;
  onChange: (path: string, value: ConfigValue) => void;
  onResetField?: (path: string) => void;
  /** See `SingleFieldRendererProps.onDiscardField`. */
  onDiscardField?: (path: string) => void;
  editedValues?: FlatConfigMap;
  disabled?: boolean;
  previewMode?: boolean;
  previewScope?: ConfigScope;
  previewChangedPaths?: string[] | null;
  resolvedValues?: FlatConfigMap | null;
  permissions?: ScopePermissions;
  showChangedOnly?: boolean;
  configuredPaths?: Set<string>;
  dbOverridePaths?: Set<string>;
  touchedPaths?: Set<string>;
  pendingResets?: Set<string>;
  schemaDefaults?: FlatConfigMap;
  showConfiguredOnly?: boolean;
  isEditingScope?: boolean;
  /** YAML-defined entry keys for the section being rendered. */
  yamlBaseKeys?: Set<string>;
  onValidationError?: (message: string) => void;
  /** See `SingleFieldRendererProps.editSessionId`. */
  editSessionId?: number;
}

/** Where a save or import is written: base (all users) or one profile. */
export type WriteTarget = { type: 'base' } | { type: 'scope'; scope: ConfigScope };

export interface ImportYamlDialogProps {
  open: boolean;
  onClose: () => void;
  /** The profile open on the page, offered (and preselected) as the import target. */
  currentScope?: ConfigScope;
  schemaTree: SchemaField[];
  schemaPathSet: ReadonlySet<string>;
  /** Writes the chosen leaves to the target; rejects with the reason when nothing was written. */
  onImport: (request: ImportRequest) => Promise<void>;
}

export type ImportTab = 'upload' | 'paste';
export type ImportStep = 'input' | 'target' | 'preview';
/** Which kind of target the import wizard writes to (WS7). */
export type TargetMode = 'current' | 'base' | 'existing' | 'create';

export interface ImportValidationError {
  path: string;
  message: string;
}

export interface ImportParseResult {
  success: boolean;
  error?: string;
  validationErrors?: ImportValidationError[];
  /** The parsed YAML exactly as written: no schema defaults, unknown keys kept. */
  appConfig: ConfigRecord | null;
  /** Leaf paths the panel's bundled schema does not describe (kept on import). */
  unknownPaths: string[];
  /** 1-based line and column of a YAML syntax error. */
  mark?: { line: number; column: number };
}

/** An in-app link appended to an info banner (VS-10). */
export interface InfoBannerLink {
  to: '/access';
  search: { tab: 'roles' | 'groups' };
  labelKey: string;
}

export interface InfoBannerProps {
  text: string;
  dismissible?: boolean;
  /** Persists the dismissal in localStorage under this key; without it dismissal lasts until remount. */
  dismissKey?: string;
  link?: InfoBannerLink;
  variant?: 'info' | 'scope-preview' | 'scope-edit';
  scopeSelection?: ScopeSelection;
  onBackToBase?: () => void;
}

export interface ModalValueControlProps {
  fieldSchema?: SchemaField;
  controlType: string;
  value: ConfigValue;
  onChange: (value: ConfigValue) => void;
  onSubmit: () => void;
}

export interface ScopeSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentSelection: ScopeSelection;
  onSelect: (selection: ScopeSelection) => void;
  permissions: ScopePermissions;
  onError?: (message: string) => void;
  /** Unsaved edits: the open profile can't be deleted until they are saved or discarded. */
  isDirty?: boolean;
}

export interface ScopeTriggerButtonProps {
  currentSelection: ScopeSelection;
  onClick: () => void;
  /** A `?scope=` link while the profile list loads: names no scope yet. */
  loading?: boolean;
  /** The profile list failed to load: the linked profile can't be named. */
  unavailable?: boolean;
}

/** The control cell of a settings row. */
export interface SectionControlsProps {
  children: ReactNode;
  /** Control width token (VS-6). */
  width?: ControlWidth;
}

/** The label cell of a settings row: label, hint and description. */
export interface SectionHeaderProps {
  title: string;
  description?: string;
  learnMoreUrl?: string;
  htmlFor?: string;
  titleAdornment?: ReactNode;
  subtitle?: ReactNode;
  required?: boolean;
  children?: ReactNode;
}

export interface SaveEntry {
  fieldPath: string;
  value: ConfigValue;
}

/** A pending edit the panel will not send (or the backend did not store), and why. */
export interface SkippedChange {
  fieldPath: string;
  reason: SkipReason;
}

/** Save entries collected from an imported YAML, and the leaves left out. */
export interface ImportEntries {
  entries: SaveEntry[];
  skipped: ImportSkippedKey[];
}

export interface SavePayload {
  touched: string[];
  saves: SaveEntry[];
  resets: string[];
  skipped: SkippedChange[];
}

/** What `buildSavePayload` needs to tell a real change from a blank or unchanged one. */
export interface SaveContext {
  /** Schema tree used to tell record and list fields apart. */
  fields: SchemaField[];
  /** Current saved value at a path in the edit target (base or the open profile). */
  baselineAt: (path: string) => ConfigValue;
  /** Whether the edit target holds its own override at (or under) a path. */
  hasOverride: (path: string) => boolean;
  /** Whether the edit target is a profile, whose values beneath come from Base (not librechat.yaml). */
  isScope?: boolean;
}

/** Result of the server-side pre-flight that runs before any write. */
export interface ConfigCheckResult {
  errors: FieldValidationError[];
  skipped: SkippedChange[];
}

/** Body of an admin API field PATCH reply: an error, a "nothing applied" message, or the stored config. */
export interface PatchFieldsResponse {
  error?: string;
  message?: string;
  /** `CONFIG_OVERRIDE_INVALID` when the admin API rejected the values (see `issues`). */
  code?: string;
  /** Paths (YAML keys, array indices of the sent value) and stable codes of rejected values. */
  issues?: Array<{ path: string; code: string }>;
  config?: { overrides?: ConfigRecord; tombstones?: string[] } | null;
}

/** Outcome of a save call: how many entries the backend applied and which were dropped. */
export interface ConfigWriteResult {
  success: boolean;
  applied: number;
  skipped: SkippedChange[];
}

export interface ManagedNoticeProps {
  /** The edit target holds its own (ignored) override for the field. */
  hasOverride: boolean;
  /** Removal of that override is already queued for the next save. */
  pendingRemoval: boolean;
  onRemoveOverride?: () => void;
}

/** A collapsible group of entry fields (custom endpoint cards, MCP server cards). */
export interface FieldGroupDef {
  labelKey: string;
  fields: string[];
  defaultExpanded: boolean;
  children?: FieldGroupDef[];
}

/** One named provider (openAI, anthropic, …) on the AI Providers tab. */
export type ProviderSectionProps = Omit<FieldRendererProps, 'fields'> & { field: SchemaField };

export interface UnknownSettingsProps {
  /** Every schema field of the object (the full list, not a filtered subset). */
  fields: SchemaField[];
  value: ConfigValue;
  path: string;
}
