import { useId } from 'react';
import { Dropdown } from '@librechat/client';
import type t from 'librechat-data-provider';
import { useLocalize, TranslationKeys } from '~/hooks';

/**
 * Sort options offered by the marketplace, in the order they appear in the dropdown.
 * Also the allowlist `Marketplace.tsx` validates the `?sort=` URL param against, so an
 * option missing here is unreachable even by direct link. Keep in sync with
 * `AgentSortOption` in `packages/data-provider/src/types/assistants.ts` (the shared type)
 * and with the server-side allowlist in `api/server/controllers/agents/v1.js`.
 */
export const SORT_OPTIONS: Array<{ value: t.AgentSortOption; labelKey: TranslationKeys }> = [
  { value: 'newest', labelKey: 'com_agents_sort_newest' },
  { value: 'oldest', labelKey: 'com_agents_sort_oldest' },
  { value: 'popular', labelKey: 'com_agents_sort_popular' },
  { value: 'author', labelKey: 'com_agents_sort_author' },
];

export const DEFAULT_SORT_OPTION: t.AgentSortOption = 'newest';

interface SortDropdownProps {
  value: t.AgentSortOption;
  onChange: (value: t.AgentSortOption) => void;
  /**
   * Which of the two panes rendered by `Marketplace.tsx`'s category-switch transition
   * this instance belongs to. Required (no default) precisely so it can drive a STABLE
   * `testId`: a `useId()`-derived one produces `:r1:`-style values that shift with the
   * render tree, leaving end-to-end tests without a dependable selector. `useId()` is
   * still used below, but only for the accessibility label, where a shifting id is
   * harmless.
   */
  frame: 'current' | 'next';
}

/**
 * Sort control for the agent marketplace.
 *
 * Thin wrapper around `@librechat/client`'s `Dropdown`. Re-picking the already-active
 * option is deliberately left as a no-op — the underlying Ariakit `Select` store fires
 * no `onChange` in that case, which is exactly the behaviour wanted here.
 */
const SortDropdown: React.FC<SortDropdownProps> = ({ value, onChange, frame }) => {
  const localize = useLocalize();
  const options = SORT_OPTIONS.map((option) => ({
    value: option.value,
    label: localize(option.labelKey),
  }));

  // `Dropdown` has no built-in visible label (its `label` prop only prefixes text inside
  // the trigger), so pair it with a sibling <span> via `aria-labelledby`, the same way
  // the theme/language selectors do. `useId` rather than a static id because two
  // SortDropdowns are mounted at once during the category-switch pane transition, and a
  // duplicated DOM id would make the accessible name ambiguous.
  const labelId = useId();

  return (
    <span className="flex items-center gap-2">
      <span id={labelId} className="whitespace-nowrap text-sm text-text-secondary">
        {localize('com_agents_sort_label')}
      </span>
      <Dropdown
        value={value}
        onChange={(v) => onChange(v as t.AgentSortOption)}
        options={options}
        sizeClasses="w-[160px]"
        testId={`agent-sort-dropdown-${frame}`}
        aria-labelledby={labelId}
      />
    </span>
  );
};

export default SortDropdown;
