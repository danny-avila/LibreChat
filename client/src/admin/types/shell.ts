import type { ReactNode } from 'react';
import type { ConfigValue, ReadOnlyReason } from './config';
import type { ConfigSectionConfig } from './config-ui';
import type { QueryClient } from '~/admin/query';
import type { ConfigScope } from './scope';

/** Search params of `/configuration` (WS5). */
export interface ConfigSearchParams {
  tab?: string;
  /** Data path (or legacy DOM id) to reveal, focus and then drop from the URL. */
  field?: string;
  /** Open profile: `role:USER`, `group:<id>`, `user:<id>` (legacy: the profile's `_id`). */
  scope?: string;
  /** `1` shows only customized settings. */
  customized?: 1;
}

/** Tab placement, labels and order of a top-level config section (WS5: configMeta). */
export interface SectionMeta {
  titleKey: string;
  descriptionKey: string;
  tab: string;
  /** Renders another schema section's data under this id (virtual section). */
  schemaKey?: string;
  /** Position within the tab; sections without one sort after, by key. */
  order?: number;
  /** Sections rendered together as one card by an area renderer (e.g. `storage`, WS13). */
  group?: string;
  /** Only paths under this prefix belong to the section (custom endpoints). */
  pathPrefix?: string;
  /** Paths under this prefix belong to another section (providers vs custom endpoints). */
  excludePrefix?: string;
}

/** Context every route receives from `getRouter` (WS5: page shell). */
export interface RouterContext {
  queryClient: QueryClient;
}

/** Whether the data the configuration form edits has loaded (WS5). */
export type ConfigBaselineStatus = 'pending' | 'error' | 'ready';

/** Load state of the base config and, in a profile, the profile's overrides (WS5). */
export interface ConfigBaselineState {
  status: ConfigBaselineStatus;
  error: Error | null;
  /** Refetches whichever layer failed. */
  retry: () => void;
}

/** Error card shown in place of the configuration form (WS5). */
export interface ConfigLoadErrorProps {
  error: unknown;
  onRetry: () => void;
  retrying?: boolean;
  /** What failed, when it is not the configuration itself (the profile list). */
  titleKey?: string;
  descriptionKey?: string;
}

export interface ExpandProviderProps {
  /** A new key (tab or scope change) forgets the last Expand all / Collapse all. */
  resetKey: string;
  children: ReactNode;
}

export interface ConfigContentSkeletonProps {
  rows?: number;
}

/** A bulk expand or collapse request; `seq` changes on every request (WS5). */
export interface ExpandSignal {
  mode: 'expand' | 'collapse' | null;
  seq: number;
}

/** What a held navigation would do: leave the page or open another profile (WS5). */
export type NavigationIntent = { kind: 'leave' } | { kind: 'scope'; name: string };

/** Options of `useNavigationGuard` (WS5: SH-6). */
export interface NavigationGuardOptions {
  isDirty: boolean;
  discardEdits: () => void;
  /** Opens the change review ("Save & continue"). */
  openReview: () => void;
  reviewOpen: boolean;
  saving: boolean;
  /** Display name of the profile a `?scope=` value opens (Base when undefined). */
  describeScope: (scope: string | undefined) => string;
}

/** The guard dialog's state and actions (WS5). */
export interface NavigationGuardState {
  open: boolean;
  intent: NavigationIntent;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export interface NavigationGuardDialogProps
  extends Omit<NavigationGuardState, 'open'>,
    Pick<NavigationGuardState, 'open'> {
  changeCount: number;
}

/** Why a section is shown read-only, and what its banner says (WS5; HF-8, FX-10, PR-7). */
export type ReadOnlySectionReason = ReadOnlyReason | 'scope';

export interface ReadOnlySectionProps {
  reason: ReadOnlySectionReason;
  /** A heading above the reason (e.g. "Registration: applies to everyone"). */
  title?: string;
  /** Overrides the default banner text for the reason. */
  message?: string;
  /** A further note under the reason (e.g. values a profile stores there in vain). */
  detail?: string;
  /** For `scope`: leaves the profile so the section can be edited in Base. */
  onEditInBase?: () => void;
  /** Nothing in the section is set: its rows (all "Not set") stay folded behind "Show all fields". */
  isEmpty?: boolean;
  /** A search or deep link targets a field inside: the rows unfold so it can be shown. */
  reveal?: boolean;
  children?: ReactNode;
}

/** One entry of the configuration search index (WS5: SH-3). */
export interface ConfigSearchItem {
  id: string;
  /** Localized label of the setting, entry or section. */
  label: string;
  /** Tab › section › group labels leading to the item. */
  breadcrumb: string[];
  /** Data path the deep link reveals (`balance.startBalance`, `endpoints.custom.3`). */
  path: string;
  tab: string;
  /** Tab section (DOM id without `section-`) that renders the path. */
  sectionId: string;
  kind: 'section' | 'field' | 'entry';
  /** Lower-cased words matched by word prefix, weighted label > key/path > breadcrumb/description. */
  terms: { label: string[]; key: string[]; context: string[] };
  /** Short display of the current value (secrets masked). */
  value?: string;
}

/** A search hit with its score (higher is better). */
export interface ConfigSearchHit {
  item: ConfigSearchItem;
  score: number;
}

/** Values the search index reads to list dynamic entries and current values. */
export type ConfigSearchValues = Record<string, ConfigValue> | null | undefined;

/** A table-of-contents entry: a section, or an entry or group under it (WS5: SH-4). */
export interface TocEntry {
  /** DOM id the content renders it under (`data-section-id`), used for active tracking. */
  id: string;
  label: string;
  /** Path `revealConfigPath` opens (a section id for sections). */
  path: string;
  /** Config path prefix for configured/dirty/error markers. */
  dataPath: string;
  /** Tab section that holds it. */
  sectionId: string;
  children: TocEntry[];
}

/** One "Jump to…" entry: a section, or a child entry under it (WS5: SH-4). */
export interface JumpTarget {
  /** DOM id the entry reveals (`section-balance`, `section-endpoints-custom-3`). */
  id: string;
  label: string;
  child?: boolean;
}

export interface JumpToSelectProps {
  targets: JumpTarget[];
  onJump: (id: string) => void;
}

export interface ToolbarFilterProps {
  value: string;
  onChange: (value: string) => void;
  /** Matching settings of the tab, best first. */
  hits?: ConfigSearchHit[];
  onSelect?: (item: ConfigSearchItem) => void;
}

/** A reveal request for the configuration page: a data path, optionally under a known section. */
export interface RevealTarget {
  path: string;
  /** DOM id (without `section-`) of the tab section that holds the path, when known. */
  sectionId?: string;
}

/** Options of `useRevealField` (WS5). */
export interface RevealFieldOptions {
  container: HTMLElement | null;
  /** Data path (or legacy DOM id) from `?field=`. */
  field?: string;
  sections: ConfigSectionConfig[];
  /** The form has mounted with its baseline. */
  ready: boolean;
  /** Called once the field was revealed or given up on; must be stable. */
  onDone: () => void;
}

/** Result of parsing a `?scope=` value (WS5: SH-5). */
export type ScopeParam =
  | { kind: 'principal'; principalType: ConfigScope['principalType']; principalId: string }
  | { kind: 'id'; id: string };

/** How `revealConfigPath` shows a path (WS5: SH-3). */
export interface RevealOptions {
  /** Where the target lands; `auto` centres a field and puts a section, group or card at the top. */
  align?: 'auto' | 'center' | 'start';
  focus?: boolean;
  highlight?: boolean;
  /** Called once with the revealed element, or null when it never appeared. */
  onDone?: (el: HTMLElement | null) => void;
}
