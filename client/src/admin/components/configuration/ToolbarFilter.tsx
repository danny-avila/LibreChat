import type { KeyboardEvent } from 'react';
import type * as t from '~/admin/types';
import { useLocalize } from '~/admin/hooks';
import { SearchField } from '~/admin/ui';

/**
 * "Filter this tab…": narrows the tab to the settings that match, row by row
 * (the page itself shows the matches and a no-match state). Enter jumps to the
 * best match; Escape clears the filter.
 */
export function ToolbarFilter({ value, onChange, hits, onSelect }: t.ToolbarFilterProps) {
  const localize = useLocalize();

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      onChange('');
      return;
    }
    const best = hits?.[0];
    if (event.key === 'Enter' && best && onSelect) {
      event.preventDefault();
      onSelect(best.item);
    }
  };

  return (
    <div
      className="cui-field relative w-full max-w-72 min-w-48 flex-1 sm:w-auto"
      onKeyDown={handleKeyDown}
    >
      <SearchField
        value={value}
        onChange={onChange}
        placeholder={localize('com_admin_config_shell_filter_placeholder')}
        aria-label={localize('com_admin_config_shell_filter_placeholder')}
      />
    </div>
  );
}
