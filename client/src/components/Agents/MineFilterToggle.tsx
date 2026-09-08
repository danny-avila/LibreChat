import React, { useId } from 'react';
import { Switch } from '@librechat/client';
import { useLocalize } from '~/hooks';

interface MineFilterToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/**
 * Toggle restricting the marketplace grid to agents authored by the current user.
 *
 * Extracted into its own component because the marketplace renders its category header
 * twice (current + transition pane) during the 300ms tab animation, and both copies must
 * stay in lockstep. `useId` keeps the label ids unique across those simultaneous mounts —
 * a hardcoded id would be duplicated in the DOM and make the accessible name ambiguous.
 */
const MineFilterToggle: React.FC<MineFilterToggleProps> = ({ checked, onCheckedChange }) => {
  const localize = useLocalize();
  const labelId = useId();

  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-labelledby={labelId}
        data-testid="marketplace-mine-toggle"
      />
      <span id={labelId} className="whitespace-nowrap text-sm text-text-secondary">
        {localize('com_agents_filter_mine')}
      </span>
    </div>
  );
};

export default MineFilterToggle;
