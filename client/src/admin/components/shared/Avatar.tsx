import type * as t from '~/admin/types';
import { Avatar as CUIAvatar } from '~/admin/ui';
import { getInitials } from '~/admin/utils';

export function Avatar({ name, size = 'md', className }: t.AvatarProps) {
  return <CUIAvatar text={getInitials(name)} textSize={size} title={name} className={className} />;
}
