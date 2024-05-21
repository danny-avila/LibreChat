import { UserIcon } from '~/components/svg';
import { useAuthContext } from '~/hooks/AuthContext';
import useAvatar from '~/hooks/Messages/useAvatar';
import useLocalize from '~/hooks/useLocalize';
import { IconProps } from '~/common';
import { cn } from '~/utils';
import MessageEndpointIcon from './MessageEndpointIcon';

const Icon: React.FC<IconProps> = (props) => {
  const { user } = useAuthContext();
  const { size = 30, isCreatedByUser } = props;

  const avatarSrc = useAvatar(user);
  const localize = useLocalize();

  if (isCreatedByUser) {
    const username = user?.name || user?.username || localize('com_nav_user');

    return (
      <div
        title={username}
        style={{
          width: size,
          height: size,
        }}
        className={cn('relative flex items-center justify-center', props.className ?? '')}
      >
        {!user?.avatar && !user?.username ? (
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
          <img className="rounded-full" src={user?.avatar || avatarSrc} alt="avatar" />
        )}
      </div>
    );
  }
  return <MessageEndpointIcon {...props} />;
};

export default Icon;
