import { useState } from 'react';
import type * as t from '~/admin/types';
import { useLocalize } from '~/admin/hooks';
import { Select } from '~/admin/ui';

/** "Jump to…" list of the tab's sections, for widths where the table of contents is hidden. */
export function JumpToSelect({ targets, onJump }: t.JumpToSelectProps) {
  const localize = useLocalize();
  const [resetKey, setResetKey] = useState(0);
  return (
    <div className="w-48 xl:hidden">
      <Select
        key={resetKey}
        placeholder={localize('com_admin_config_shell_jump_to')}
        aria-label={localize('com_admin_config_shell_jump_to')}
        onSelect={(id) => {
          onJump(id);
          setResetKey((key) => key + 1);
        }}
        options={targets.map((target) => ({
          value: target.id,
          /* Non-breaking spaces indent a child under its parent in the list. */
          label: target.child ? `${'\u00a0'.repeat(3)}${target.label}` : target.label,
        }))}
      />
    </div>
  );
}
