import { memo, useMemo } from 'react';
import type { IconMapProps } from '~/common';
import { icons } from '~/components/Chat/Menus/Endpoints/Icons';
import { URLIcon } from '~/components/Endpoints/URLIcon';

interface ConvoIconURLProps {
  iconURL?: string;
  modelLabel?: string | null;
  endpointIconURL?: string;
  assistantName?: string;
  agentName?: string;
  context?: 'landing' | 'menu-item' | 'nav' | 'message';
  assistantAvatar?: string;
  agentAvatar?: string;
}

const classMap = {
  'menu-item': 'relative flex h-full items-center justify-center overflow-hidden rounded-full',
  message: 'icon-md',
  default: 'icon-xl relative flex h-full overflow-hidden rounded-full',
};

const styleMap = {
  'menu-item': { width: '20px', height: '20px' },
  default: { width: '100%', height: '100%' },
};

const styleImageMap = {
  default: { width: '100%', height: '100%' },
};

const ConvoIconURL: React.FC<ConvoIconURLProps> = ({
  iconURL = '',
  modelLabel = '',
  endpointIconURL,
  assistantAvatar,
  assistantName,
  agentAvatar,
  agentName,
  context,
}) => {
  const Icon: (
    props: IconMapProps & {
      context?: string;
      iconURL?: string;
    },
  ) => React.JSX.Element = useMemo(() => icons[iconURL] ?? icons.unknown, [iconURL]);
  const isURL = useMemo(
    () => !!(iconURL && (iconURL.includes('http') || iconURL.startsWith('/images/'))),
    [iconURL],
  );
  if (isURL) {
    return (
      <URLIcon
        iconURL={iconURL}
        altName={modelLabel}
        className={classMap[context ?? 'default'] ?? classMap.default}
        containerStyle={styleMap[context ?? 'default'] ?? styleMap.default}
        imageStyle={styleImageMap[context ?? 'default'] ?? styleImageMap.default}
      />
    );
  }

  return (
    <div className="shadow-stroke relative flex h-full items-center justify-center rounded-full bg-white text-black">
      <Icon
        size={41}
        context={context}
        className="h-2/3 w-2/3"
        agentName={agentName}
        iconURL={endpointIconURL}
        assistantName={assistantName}
        avatar={assistantAvatar ?? agentAvatar}
      />
    </div>
  );
};

export default memo(ConvoIconURL);
