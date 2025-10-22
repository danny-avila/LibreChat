import React, { memo, useState, useMemo } from 'react';
import { UserIcon, useAvatar } from '@librechat/client';
import type { TUser } from 'librechat-data-provider';
import type { IconProps } from '~/common';
import MessageEndpointIcon from './MessageEndpointIcon';
import { useAuthContext } from '~/hooks/AuthContext';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type UserAvatarProps = {
  size: number;
  user?: TUser;
  avatarSrc: string;
  username: string;
  className?: string;
};

const UserAvatar = memo(({ size, user, avatarSrc, username, className }: UserAvatarProps) => {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const handleImageError = () => {
    setImageError(true);
    setImageLoaded(false);
  };

  const handleImageLoad = () => {
    setImageLoaded(true);
  };

  const renderDefaultAvatar = () => (
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
  );

  const hasAvatar = useMemo(() => (user?.avatar ?? '') || avatarSrc, [user?.avatar, avatarSrc]);
  const showImage = useMemo(() => hasAvatar && !imageError, [hasAvatar, imageError]);
  const imageSrc = useMemo(() => (user?.avatar ?? '') || avatarSrc, [user?.avatar, avatarSrc]);

  return (
    <div
      title={username}
      style={{
        width: size,
        height: size,
      }}
      className={cn('relative flex items-center justify-center', className ?? '')}
    >
      {!showImage || !imageLoaded ? renderDefaultAvatar() : null}
      {showImage && (
        <img
          style={{
            display: imageLoaded ? 'block' : 'none',
          }}
          className="rounded-full"
          src={imageSrc}
          alt="avatar"
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      )}
    </div>
  );
});

UserAvatar.displayName = 'UserAvatar';

const Icon: React.FC<IconProps> = memo((props) => {
  const { user } = useAuthContext();
  const { size = 30, isCreatedByUser } = props;

  const avatarSrc = useAvatar(user);
  const localize = useLocalize();

  const username = useMemo(
    () => user?.name ?? user?.username ?? localize('com_nav_user'),
    [user?.name, user?.username, localize],
  );

  if (isCreatedByUser) {
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
