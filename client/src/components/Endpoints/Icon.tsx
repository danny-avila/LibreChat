import React, { memo } from 'react';
import { UserIcon, useAvatar } from '@librechat/client';
import type { IconProps } from '~/common';
import MessageEndpointIcon from './MessageEndpointIcon';
import { useAuthContext } from '~/hooks/AuthContext';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type ResolvedAvatar = { type: 'image'; src: string } | { type: 'fallback' };

/**
 * Caches the resolved avatar decision per user ID.
 * Invalidated when `user.avatar` changes (e.g., settings upload).
 * Tracks failed image URLs so they fall back to SVG permanently for the session.
 */
const avatarCache = new Map<string, { avatar: string; resolved: ResolvedAvatar }>();
const failedUrls = new Set<string>();

function resolveAvatar(
  userId: string,
  userAvatar: string,
  username: string,
  avatarSrc: string,
): ResolvedAvatar {
  const cached = avatarCache.get(userId);
  if (cached && cached.avatar === userAvatar) {
    return cached.resolved;
  }

  const imgSrc = userAvatar || avatarSrc;
  let resolved: ResolvedAvatar;
  if (imgSrc && !failedUrls.has(imgSrc)) {
    resolved = { type: 'image', src: imgSrc };
  } else {
    resolved = { type: 'fallback' };
  }

  avatarCache.set(userId, { avatar: userAvatar, resolved });
  return resolved;
}

function markAvatarFailed(userId: string, src: string): ResolvedAvatar {
  failedUrls.add(src);
  const fallback: ResolvedAvatar = { type: 'fallback' };
  const cached = avatarCache.get(userId);
  if (cached) {
    avatarCache.set(userId, { ...cached, resolved: fallback });
  }
  return fallback;
}

type UserAvatarProps = {
  size: number;
  avatar: string;
  avatarSrc: string;
  userId: string;
  username: string;
  className?: string;
};

const UserAvatar = memo(
  ({ size, avatar, avatarSrc, userId, username, className }: UserAvatarProps) => {
    const [resolved, setResolved] = React.useState(() =>
      resolveAvatar(userId, avatar, username, avatarSrc),
    );

    React.useEffect(() => {
      setResolved(resolveAvatar(userId, avatar, username, avatarSrc));
    }, [userId, avatar, username, avatarSrc]);

    return (
      <div
        title={username}
        style={{ width: size, height: size }}
        className={cn('relative flex items-center justify-center', className ?? '')}
      >
        {resolved.type === 'image' ? (
          <img
            className="rounded-full"
            src={resolved.src}
            alt="avatar"
            onError={() => setResolved(markAvatarFailed(userId, resolved.src))}
          />
        ) : (
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
        )}
      </div>
    );
  },
);

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
        avatarSrc={avatarSrc}
        username={username}
        userId={user?.id ?? ''}
        avatar={user?.avatar ?? ''}
        className={props.className}
      />
    );
  }
  return <MessageEndpointIcon {...props} />;
});

Icon.displayName = 'Icon';

export default Icon;
