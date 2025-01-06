import React, { memo } from 'react';
import type { IconMapProps } from '~/common';
import { icons } from '~/components/Chat/Menus/Endpoints/Icons';

interface ConvoIconURLProps {
  iconURL?: string;
  modelLabel?: string;
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
  let Icon: (
    props: IconMapProps & {
      context?: string;
      iconURL?: string;
    },
  ) => React.JSX.Element;

  const isURL = !!(iconURL && (iconURL.includes('http') || iconURL.startsWith('/images/')));

  if (!isURL) {
    Icon = icons[iconURL] ?? icons.unknown;
  } else {
    Icon = () => (
      <div
        className={classMap[context ?? 'default'] ?? classMap.default}
        style={styleMap[context ?? 'default'] ?? styleMap.default}
      >
        <img
          src={iconURL}
          alt={modelLabel}
          style={styleImageMap[context ?? 'default'] ?? styleImageMap.default}
          className="object-cover"
        />
      </div>
    );

    return <Icon context={context} />;
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
