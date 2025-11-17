import { memo, useMemo } from 'react';
import { SystemRoles, EModelEndpoint } from 'librechat-data-provider';
import type { IconMapProps } from '~/common';
import { URLIcon } from '~/components/Endpoints/URLIcon';
import { icons } from '~/hooks/Endpoint/Icons';
import { useAuthContext } from '~/hooks';
import { getHyperAILogo } from '~/utils/getModelIcon';

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
  const { user } = useAuthContext();
  const isAdmin = user?.role === SystemRoles.ADMIN;
  const Icon = useMemo(() => icons[iconURL] ?? icons.unknown, [iconURL]);
  const isURL = useMemo(
    () => !!(iconURL && (iconURL.includes('http') || iconURL.startsWith('/images/'))),
    [iconURL],
  );
  
  // Determine if we should use HyperAI logo for regular users
  // Check if this is a known endpoint that should be rebranded
  const endpoint = iconURL || endpointIconURL || '';
  const shouldUseHyperAILogo = !isAdmin && 
    endpoint !== EModelEndpoint.assistants && 
    endpoint !== EModelEndpoint.azureAssistants && 
    endpoint !== EModelEndpoint.agents &&
    !assistantName &&
    !agentName;
  
  if (isURL) {
    // For regular users, replace known endpoint icons with HyperAI logo
    if (shouldUseHyperAILogo) {
      return (
        <div className={classMap[context ?? 'default'] ?? classMap.default} style={styleMap[context ?? 'default'] ?? styleMap.default}>
          {getHyperAILogo(41)}
        </div>
      );
    }
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
      {shouldUseHyperAILogo ? (
        getHyperAILogo(41)
      ) : Icon && (
        <Icon
          size={41}
          context={context}
          className="h-2/3 w-2/3"
          agentName={agentName}
          iconURL={endpointIconURL}
          assistantName={assistantName}
          avatar={assistantAvatar || agentAvatar}
        />
      )}
    </div>
  );
};

export default memo(ConvoIconURL);
