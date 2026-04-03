import { useMemo, useEffect, useRef, memo } from 'react';
import { getEndpointField } from 'librechat-data-provider';
import type { Assistant, Agent } from 'librechat-data-provider';
import type { TMessageIcon } from '~/common';
import ConvoIconURL from '~/components/Endpoints/ConvoIconURL';
import { useGetEndpointsQuery } from '~/data-provider';
import { getIconEndpoint, logger } from '~/utils';
import Icon from '~/components/Endpoints/Icon';

type MessageIconProps = {
  iconData?: TMessageIcon;
  assistant?: Assistant;
  agent?: Agent;
};

/**
 * Compares only the fields MessageIcon actually renders.
 * `agent.id` / `assistant.id` are intentionally omitted because
 * this component renders display properties only, not identity-derived content.
 */
export function arePropsEqual(prev: MessageIconProps, next: MessageIconProps): boolean {
  const checks: [string, unknown, unknown][] = [
    ['iconData.endpoint', prev.iconData?.endpoint, next.iconData?.endpoint],
    ['iconData.model', prev.iconData?.model, next.iconData?.model],
    ['iconData.iconURL', prev.iconData?.iconURL, next.iconData?.iconURL],
    ['iconData.modelLabel', prev.iconData?.modelLabel, next.iconData?.modelLabel],
    ['iconData.isCreatedByUser', prev.iconData?.isCreatedByUser, next.iconData?.isCreatedByUser],
    ['agent.name', prev.agent?.name, next.agent?.name],
    ['agent.avatar.filepath', prev.agent?.avatar?.filepath, next.agent?.avatar?.filepath],
    ['assistant.name', prev.assistant?.name, next.assistant?.name],
    [
      'assistant.metadata.avatar',
      prev.assistant?.metadata?.avatar,
      next.assistant?.metadata?.avatar,
    ],
  ];

  for (const [field, prevVal, nextVal] of checks) {
    if (prevVal !== nextVal) {
      logger.log('icon_memo_diff', `field "${field}" changed:`, prevVal, '→', nextVal);
      return false;
    }
  }
  return true;
}

const MessageIcon = memo(({ iconData, assistant, agent }: MessageIconProps) => {
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  useEffect(() => {
    logger.log(
      'icon_lifecycle',
      'MOUNT',
      iconData?.modelLabel,
      `render #${renderCountRef.current}`,
    );
    return () => {
      logger.log('icon_lifecycle', 'UNMOUNT', iconData?.modelLabel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  logger.log(
    'icon_data',
    `render #${renderCountRef.current}`,
    iconData?.isCreatedByUser ? 'user' : iconData?.modelLabel,
    iconData,
  );
  const { data: endpointsConfig } = useGetEndpointsQuery();

  const agentName = agent?.name ?? '';
  const agentAvatar = agent?.avatar?.filepath ?? '';
  const assistantName = assistant?.name ?? '';
  const assistantAvatar = assistant?.metadata?.avatar ?? '';
  let avatarURL = '';
  if (assistant) {
    avatarURL = assistantAvatar;
  } else if (agent) {
    avatarURL = agentAvatar;
  }

  const iconURL = iconData?.iconURL;
  const endpoint = useMemo(
    () => getIconEndpoint({ endpointsConfig, iconURL, endpoint: iconData?.endpoint }),
    [endpointsConfig, iconURL, iconData?.endpoint],
  );

  const endpointIconURL = useMemo(
    () => getEndpointField(endpointsConfig, endpoint, 'iconURL'),
    [endpointsConfig, endpoint],
  );

  if (iconData?.isCreatedByUser !== true && iconURL != null && iconURL.includes('http')) {
    return (
      <ConvoIconURL
        iconURL={iconURL}
        modelLabel={iconData?.modelLabel}
        context="message"
        assistantAvatar={assistantAvatar}
        agentAvatar={agentAvatar}
        endpointIconURL={endpointIconURL}
        assistantName={assistantName}
        agentName={agentName}
      />
    );
  }

  return (
    <Icon
      isCreatedByUser={iconData?.isCreatedByUser ?? false}
      endpoint={endpoint}
      iconURL={avatarURL || endpointIconURL}
      model={iconData?.model}
      assistantName={assistantName}
      agentName={agentName}
      size={28.8}
    />
  );
}, arePropsEqual);

MessageIcon.displayName = 'MessageIcon';

export default MessageIcon;
