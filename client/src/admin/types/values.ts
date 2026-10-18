import type { PrincipalType } from 'librechat-data-provider';
import type { AdminConfig } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import type { ConfigValue, ConfigRecord, FlatConfigMap } from './config';
import type { VisibilityEdit } from './changes';

/**
 * Where a field's value comes from (WS4):
 * - `default`: the schema default (or nothing at all);
 * - `runtimeDefault`: a value LibreChat fills in at startup (not in librechat.yaml);
 * - `yaml`: set in librechat.yaml;
 * - `admin`: a base admin override;
 * - `scope`: the open profile's own override (or tombstone);
 * - `inherited`: a profile field without its own value, inherited from Base.
 */
export type ProvenanceSource =
  | 'default'
  | 'runtimeDefault'
  | 'yaml'
  | 'admin'
  | 'scope'
  | 'inherited';

/** The value a field returns to when its own override is removed, and that value's layer (WS4). */
export interface RevertTarget {
  value: ConfigValue;
  source: ProvenanceSource;
}

/** One layer of a field's value, for the provenance hover card (WS4). */
export interface FieldLayer {
  source: ProvenanceSource;
  value: ConfigValue;
  /** The layer hides the value (a profile tombstone) instead of setting one. */
  hidden?: boolean;
}

/** A field whose own value is ignored because another path takes precedence (WS4, EV-8). */
export interface ShadowedBy {
  path: string;
  value: ConfigValue;
  /** `block`: the whole other block wins, even where it leaves this field unset (titles); `field`: only a value it sets wins. */
  precedence?: 'block' | 'field';
}

/** Everything a field row needs to render its value and state (WS4; `error` from WS1). */
export interface FieldState {
  /** Shown in the control: pending edit (a pending reset shows `revertTarget`) ?? own value ?? effective value. */
  value: ConfigValue;
  /** The value in effect for the edit target, ignoring pending edits. */
  effective: ConfigValue;
  source: ProvenanceSource;
  /** Only set when the edit target holds its own override (or tombstone) for this path. */
  revertTarget?: RevertTarget;
  /** Base: set in librechat.yaml or by a base override. Profile: set (or hidden) by the profile. */
  isConfigured: boolean;
  /** The edit target (base or the open profile) holds its own override. */
  isOverride: boolean;
  /** A change (including a reset) is pending for this path. */
  isEdited: boolean;
  isPendingReset: boolean;
  /** Tombstoned: hidden in the open profile (or removed from Base). */
  isHidden: boolean;
  /** A pending hide or unhide; `isHidden` already shows its outcome. */
  visibilityEdit?: VisibilityEdit;
  /** Another path whose value takes precedence (e.g. `endpoints.all`). */
  shadowedBy?: ShadowedBy;
  /** A stored base override LibreChat ignores (D5: read only from librechat.yaml); removable. */
  ignoredOverride?: boolean;
  error?: string;
  /** Profile mode: the value the field inherits from Base, and where Base gets it. */
  inherited?: RevertTarget;
  /** The value's layers, lowest first (default → librechat.yaml → admin → profile). */
  stack?: FieldLayer[];
}

/** Leaf paths of one layer, indexed for exact, descendant and ancestor lookups (WS4). */
export interface PathIndex {
  /** Leaf paths: arrays, primitives and `null` are leaves; `{}` sets nothing. */
  paths: ReadonlySet<string>;
  /** Every proper ancestor of a leaf path. */
  ancestors: ReadonlySet<string>;
}

/** The open profile's own layer (WS4). */
export interface ScopeLayer {
  principalType: PrincipalType;
  name: string;
  /** The profile's own overrides (canonical config keys). */
  overrides: ConfigRecord;
  overridePaths: PathIndex;
  /** Paths the profile hides from what it inherits. */
  tombstones: ReadonlySet<string>;
}

/** Every value layer a `FieldState` is derived from (WS4). */
export interface ValueLayers {
  schemaDefaults: FlatConfigMap;
  /** The documented default LibreChat applies when nothing is set (field meta `runtimeDefault`). */
  runtimeDefaultAt?: (path: string) => ConfigValue;
  /** librechat.yaml as LibreChat processes it, without admin overrides (`?baseOnly=true`). */
  yamlEffective: ConfigRecord | null;
  /** Paths librechat.yaml itself sets. */
  yamlPaths: PathIndex;
  /** The effective base config: librechat.yaml plus the base admin overrides. */
  base: ConfigRecord | null;
  /** The base (`__base__`) admin overrides. */
  baseOverrides: ConfigRecord;
  baseOverridePaths: PathIndex;
  /** Paths the base overrides remove from librechat.yaml. */
  baseTombstones: ReadonlySet<string>;
  /** The open profile, or null in base mode. */
  scope: ScopeLayer | null;
  /** What the edit target's users get: `base`, or Base merged with the open profile. */
  effective: ConfigRecord | null;
}

/** The page's value layers that `useFieldState` derives a `FieldState` from (WS4). */
export interface ConfigValuesData {
  /** The config tree shown on the page (pending structural edits overlaid). */
  configValues: Record<string, ConfigValue> | null;
  editedValues: FlatConfigMap;
  /** Legacy: the open profile's flattened values, used only when `layers` is absent. */
  resolvedValues?: FlatConfigMap | null;
  schemaDefaults?: FlatConfigMap;
  configuredPaths?: Set<string>;
  /** Paths the edit target holds its own override for. */
  overridePaths?: Set<string>;
  pendingResets?: Set<string>;
  isEditingScope?: boolean;
  /** The layer model; without it `deriveFieldState` falls back to the fields above. */
  layers?: ValueLayers | null;
  /** Pending profile Hide/Unhide by path: a row shows what Save will do. */
  visibilityEdits?: Readonly<Record<string, VisibilityEdit>>;
}

/** Props of `ConfigValuesProvider` (WS4). */
export interface ConfigValuesProviderProps {
  /** Memoize it: every `useFieldState` consumer re-renders when it changes. */
  value: ConfigValuesData;
  children: ReactNode;
}

/** What a configuration tab's badge counts (WS4, EV-3). */
export interface TabBadge {
  /** Collection tabs count entries ("25 endpoints"); other tabs count customized settings. */
  kind: 'entries' | 'customized';
  count: number;
  /** Locale key (with `_one`/`_other` plurals and a `count` option), e.g. "1 spec". */
  labelKey: string;
  /** Pending (unsaved) edits on the tab. */
  pending: number;
  /**
   * Overrides on the tab: Base's admin overrides (settings, or entries the
   * panel overrides or added), or in a profile the collection entries it
   * overrides or adds.
   */
  overrides: number;
  /** The overrides are the open profile's, not Base's admin overrides. */
  scope?: boolean;
}

/** Props of `TabCountBadge` (WS4). */
export interface TabCountBadgeProps {
  badge?: TabBadge;
}

/** Props of `ProvenanceChip` (WS4). */
export interface ProvenanceChipProps {
  state: FieldState;
  /** The open profile, for "Role: USER" style labels. */
  scope?: Pick<ScopeLayer, 'principalType' | 'name'> | null;
  /** Render nothing for a field that only has its schema default. */
  hideDefault?: boolean;
  /** The field's path, so credential values are masked in the hover card. */
  path?: string;
}

/** Props of `FieldProvenance`: the chip for one path, read from the nearest provider (WS4). */
export interface FieldProvenanceProps {
  path: string;
  hideDefault?: boolean;
}

/** Label and accessible name of a field's revert action (WS4, EV-4). */
export interface RevertLabels {
  label: string;
  ariaLabel: string;
}

/** The base config payload: every layer the page reads (WS4, EV-1 and EV-7). */
export interface BaseConfigData {
  /** Effective base config (librechat.yaml + base overrides) without runtime internals. */
  config: ConfigRecord;
  /** librechat.yaml as LibreChat processes it, without admin overrides (`?baseOnly=true`). */
  yamlConfig?: ConfigRecord;
  /** Leaf paths the raw librechat.yaml sets (`{}` ignored). */
  yamlPaths: string[];
  /** The base (`__base__`) admin overrides. */
  dbOverrides?: ConfigRecord;
  /** Paths the base overrides remove from librechat.yaml. */
  dbTombstones: string[];
  schemaDefaults: FlatConfigMap;
  /** MCP servers defined in librechat.yaml. */
  yamlMcpKeys?: string[];
  yamlMcpServers?: Record<string, ConfigValue>;
}

/** An admin config document as the API returns it, including its tombstones. */
export interface AdminConfigDocResponse {
  config: AdminConfig & { tombstones?: string[] };
}

/** One profile's own config document (WS4). */
export interface ResolvedConfigData {
  /** Legacy: the profile's own overrides, flattened. */
  resolvedConfig: FlatConfigMap;
  /** Legacy: the profile's own override leaf paths. */
  changedPaths: string[];
  /** The profile's own overrides (canonical config keys). */
  overrides: ConfigRecord;
  /** Paths the profile hides from what it inherits. */
  tombstones: string[];
}
