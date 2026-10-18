import type { ReactNode, Ref } from 'react';
import type { IconSize as AssetSize } from '~/admin/ui';
import type { IconName } from './scope';

/** A click-ui icon that only decorates its parent; its name never reaches the accessibility tree (WS6). */
export interface DecorativeIconProps {
  name: IconName;
  size?: AssetSize;
  className?: string;
}

/**
 * The state a settings row can be in (WS6). Provenance kinds mirror
 * `ProvenanceSource`; `edited`, `pendingRevert` and `error` describe the
 * pending change set.
 */
export type StateChipKind =
  | 'default'
  | 'yaml'
  | 'override'
  | 'scope'
  | 'inherited'
  | 'edited'
  | 'pendingRevert'
  | 'error';

export interface StateChipProps {
  kind: StateChipKind;
  /** Replaces the kind's default label (e.g. "Role: USER" for `scope`). */
  label?: string;
  /** Longer explanation, shown as a tooltip and read after the label. */
  description?: string;
  /** Renders an undo button inside the chip (edited and pending-revert rows). */
  onUndo?: () => void;
  /** Accessible name of the undo button. */
  undoLabel?: string;
}

/** A configured/total count next to a section or group title (WS6 styles it; WS4 owns the numbers). */
export interface CountBadgeProps {
  configured: number;
  total: number;
  /** A collection (list or record of entries): show its entry count, not configured/total. */
  entries?: boolean;
  /** How many of them are admin overrides (Base only), shown apart from librechat.yaml values. */
  overrides?: number;
}

export interface OverrideCountProps {
  count: number;
}

/** Heading level of a settings container: 2 for top-level sections, 3+ for nested groups. */
export type SettingsHeadingLevel = 2 | 3 | 4 | 5 | 6;

/** Look of a settings container: a bordered card, or a group contained by a left rule. */
export type SettingsSectionVariant = 'card' | 'group';

/**
 * One settings container (WS6): a top-level section card or a nested group
 * contained by a left rule. The heading wraps the expand button, following the
 * WAI-ARIA accordion pattern; heading levels nest automatically.
 */
export interface SettingsSectionProps {
  /** DOM id of the `<section>` (TOC and deep links target it). */
  id?: string;
  title: string;
  description?: ReactNode;
  learnMoreUrl?: string;
  variant?: SettingsSectionVariant;
  /** Defaults to one below the enclosing settings section (h2 at the top level). */
  level?: SettingsHeadingLevel;
  /** Shown after the title, inside the heading (e.g. a `CountBadge`). */
  badge?: ReactNode;
  /** Header actions placed after the heading (e.g. "+ Add entry"). */
  actions?: ReactNode;
  /** When false the heading is static text and the body is always shown. */
  collapsible?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  /** Keeps the body unmounted until the first expand (mirrors `renderCollapsible`). */
  hasEverExpanded?: boolean;
  /** Pins the header to the top of the scroll container while the section is open. */
  sticky?: boolean;
  /** Attached to the `<section>` so Expand all, the TOC and deep links can reach it. */
  sectionRef?: Ref<HTMLElement>;
  children: ReactNode;
}

/** A section with exactly one field: its title and description label the field (VS-2). */
export interface SoleFieldSectionProps {
  /** DOM id of the `<section>`. */
  domId?: string;
  title: string;
  description?: string;
  learnMoreUrl?: string;
  children: ReactNode;
}

/** Context a single-field section provides so its row renders without a second label (VS-2). */
export interface SoleFieldContextValue {
  /** Id of the section heading the control is named after. */
  headingId: string;
  sectionTitle: string;
}

/** The cells a row lends to its single-field section's header row. */
export interface SoleFieldRowProps {
  sole: SoleFieldContextValue;
  label: string;
  htmlFor?: string;
  children: ReactNode;
}

/** Persisted dismissal of an info banner: a stable id per banner (VS-10). */
export interface BannerDismissal {
  dismissed: boolean;
  dismiss: () => void;
}
