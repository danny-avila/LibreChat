import { useId, useState, useCallback } from 'react';
import type * as t from '~/admin/types';
import { useLocalize, useExpandRequest } from '~/admin/hooks';
import { DecorativeIcon } from '~/admin/components/shared';
import { ToolbarFilter } from './ToolbarFilter';
import { Button, Checkbox } from '~/admin/ui';
import { JumpToSelect } from './JumpToSelect';
import { cn } from '~/admin/utils';

/**
 * Opens or closes Radix accordions that other renderers own (e.g. the AI
 * providers list): they keep their own state, so their triggers are clicked.
 */
function toggleUnmanagedAccordions(container: HTMLElement | null, expand: boolean) {
  if (!container) return;
  const state = expand ? 'closed' : 'open';
  const item = `[data-top-level-accordion]:not([data-expand-managed]) > [data-state="${state}"]`;
  const triggers = container.querySelectorAll<HTMLButtonElement>(
    `${item} > button, ${item} > h3 > button`,
  );
  for (const trigger of triggers) trigger.click();
}

/**
 * The tab's toolbar, in normal flow under the tab bar: filter, "Set values
 * only", jump list (below xl, where the table of contents is hidden), and
 * Expand all / Collapse all for every section, group and entry card. Below
 * `md` the filter, checkbox and jump list fold behind one Filter button, so
 * the toolbar is a single row and the settings keep the screen.
 */
export function ContentToolbar({
  scrollContainer,
  filter,
  onFilterChange,
  filterHits,
  onFilterSelect,
  customizedOnly,
  onCustomizedOnlyChange,
  nothingCustomized,
  jumpTargets,
  onJump,
}: t.ContentToolbarProps) {
  const localize = useLocalize();
  const requestExpand = useExpandRequest();
  const filtersId = useId();
  const [filtersOpen, setFiltersOpen] = useState(() => filter !== '' || customizedOnly);
  const filtering = filter !== '' || customizedOnly;

  const handleExpandAll = useCallback(() => {
    requestExpand('expand');
    toggleUnmanagedAccordions(scrollContainer, true);
  }, [requestExpand, scrollContainer]);

  const handleCollapseAll = useCallback(() => {
    requestExpand('collapse');
    toggleUnmanagedAccordions(scrollContainer, false);
    scrollContainer?.scrollTo({ top: 0 });
  }, [requestExpand, scrollContainer]);

  const customizedDisabled = nothingCustomized && !customizedOnly;

  return (
    <div
      role="toolbar"
      aria-label={localize('com_admin_config_shell_toolbar')}
      className="flex flex-wrap items-center gap-x-2 gap-y-2 border-t border-(--cui-color-stroke-default) py-2 md:gap-x-4"
    >
      <span className="flex md:hidden">
        <button
          type="button"
          aria-expanded={filtersOpen}
          aria-controls={filtersId}
          onClick={() => setFiltersOpen((open) => !open)}
          className="config-add-btn ml-0"
        >
          <DecorativeIcon name="filter" size="sm" />
          <span>{localize('com_admin_config_shell_filters')}</span>
          {filtering && (
            <span className="h-1.5 w-1.5 rounded-full bg-(--settings-accent)">
              <span className="sr-only">{localize('com_admin_config_shell_filters_active')}</span>
            </span>
          )}
        </button>
      </span>
      <div
        id={filtersId}
        className={cn(
          'order-last w-full flex-wrap items-center gap-x-4 gap-y-2 md:order-0 md:flex md:w-auto',
          filtersOpen ? 'flex' : 'hidden',
        )}
      >
        <ToolbarFilter
          value={filter}
          onChange={onFilterChange}
          hits={filterHits}
          onSelect={onFilterSelect}
        />
        <div
          title={
            customizedDisabled
              ? localize('com_admin_config_shell_nothing_customized_hint')
              : undefined
          }
          className="flex items-center"
        >
          <Checkbox
            id="config-customized-only"
            label={localize('com_admin_config_shell_customized_only')}
            checked={customizedOnly}
            disabled={customizedDisabled}
            onCheckedChange={(checked) => onCustomizedOnlyChange(checked === true)}
          />
        </div>
        {jumpTargets && jumpTargets.length > 0 && onJump && (
          <JumpToSelect targets={jumpTargets} onJump={onJump} />
        )}
      </div>
      <div className="ml-auto hidden items-center gap-1 md:flex">
        <Button
          htmlType="button"
          type="empty"
          iconLeft="chevron-down"
          label={localize('com_admin_config_expand_all')}
          onClick={handleExpandAll}
        />
        <Button
          htmlType="button"
          type="empty"
          iconLeft="chevron-right"
          label={localize('com_admin_config_collapse_all')}
          onClick={handleCollapseAll}
        />
      </div>
      <div className="ml-auto flex items-center gap-1 md:hidden">
        <button
          type="button"
          onClick={handleExpandAll}
          title={localize('com_admin_config_expand_all')}
          className="icon-btn h-8 w-8"
        >
          <DecorativeIcon name="expand-all" size="sm" />
          <span className="sr-only">{localize('com_admin_config_expand_all')}</span>
        </button>
        <button
          type="button"
          onClick={handleCollapseAll}
          title={localize('com_admin_config_collapse_all')}
          className="icon-btn h-8 w-8"
        >
          <DecorativeIcon name="collapse-all" size="sm" />
          <span className="sr-only">{localize('com_admin_config_collapse_all')}</span>
        </button>
      </div>
    </div>
  );
}
