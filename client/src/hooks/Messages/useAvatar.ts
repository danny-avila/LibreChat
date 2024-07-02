import { useState, useEffect } from 'react';
import { createAvatar } from '@dicebear/core';
import { initials } from '@dicebear/collection';
import type { TUser } from 'librechat-data-provider';

const useAvatar = (user: TUser | undefined) => {
  const [avatarSrc, setAvatarSrc] = useState('');

  useEffect(() => {
    if (avatarSrc.length) {
      return;
    }

    if (user?.avatar) {
      return;
    }

    if (!user?.username && !user?.name) {
      return;
    }

    const generateAvatar = async () => {
      if (!user) {
        return;
      }

      const { username, name } = user;

      const avatar = createAvatar(initials, {
        seed: username.length === 0 ? name : username,
        fontFamily: ['Verdana'],
        fontSize: 36,
      });

      try {
        const avatarDataUri = await avatar.toDataUri();
        setAvatarSrc(avatarDataUri);
      } catch (error) {
        console.error('Failed to generate avatar:', error);
        setAvatarSrc('');
      }
    };

    generateAvatar();
  }, [user, avatarSrc.length]);

  return avatarSrc;
};

export default useAvatar;
