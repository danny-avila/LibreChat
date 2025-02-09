import React, { memo } from 'react';
import type { TUser } from 'librechat-data-provider';
import type { IconProps } from '~/common';
import MessageEndpointIcon from './MessageEndpointIcon';
import { useAuthContext } from '~/hooks/AuthContext';
import useAvatar from '~/hooks/Messages/useAvatar';
import useLocalize from '~/hooks/useLocalize';
import { UserIcon } from '~/components/svg';
import { cn } from '~/utils';

type UserAvatarProps = {
  size: number;
  user?: TUser;
  avatarSrc: string;
  username: string;
  className?: string;
};

const UserAvatar = memo(({ size, user, avatarSrc, username, className }: UserAvatarProps) => (
  <div
    title={username}
    style={{
      width: size,
      height: size,
    }}
    className={cn('relative flex items-center justify-center', className ?? '')}
  >
    {!(user?.avatar ?? '') && (!(user?.username ?? '') || user?.username.trim() === '') ? (
      <div
        style={{
          backgroundColor: 'rgb(121, 137, 255)',
          width: '20px',
          height: '20px',
          boxShadow: 'rgba(240, 246, 252, 0.1) 0px 0px 0px 1px',
        }}
        className="relative flex h-9 w-9 items-center justify-center rounded-sm p-1 text-white"
      >
        <UserIcon />
      </div>
    ) : (
      <img className="rounded-full" src={(user?.avatar ?? '') || avatarSrc} alt="avatar" />
    )}
  </div>
));

UserAvatar.displayName = 'UserAvatar';

const Icon: React.FC<IconProps> = memo((props) => {
  const { user } = useAuthContext();
  const { size = 30, isCreatedByUser } = props;

  const avatarSrc = useAvatar(user);
  const localize = useLocalize();

  if (isCreatedByUser) {
    const username = user?.name ?? user?.username ?? localize('com_nav_user');
    return (
      <UserAvatar
        size={size}
        user={user}
        avatarSrc={avatarSrc}
        username={username}
        className={props.className}
      />
    );
  }
  return <MessageEndpointIcon {...props} />;
});

Icon.displayName = 'Icon';

export default Icon;
