import type * as t from '~/admin/types';
import { Icon } from '~/admin/ui';

/**
 * A click-ui `Icon` hidden from assistive technology. click-ui renders every
 * icon as `<svg role="img" aria-label={name}>`, which leaks names such as
 * "chevron-right" or "cross" into the accessible name of the surrounding
 * button or link; use this inside anything interactive.
 */
export function DecorativeIcon({ name, size, className }: t.DecorativeIconProps) {
  return (
    <Icon
      name={name}
      size={size}
      className={className}
      role={undefined}
      aria-label={undefined}
      aria-hidden="true"
      focusable="false"
    />
  );
}
