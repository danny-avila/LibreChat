import { EModelEndpoint } from 'librechat-data-provider';
import type { SwitcherProps } from '~/common';
import AssistantSwitcher from './AssistantSwitcher';
import { useChatContext } from '~/Providers';
import ModelSwitcher from './ModelSwitcher';

export default function Switcher(props: SwitcherProps) {
  const { conversation } = useChatContext();
  const { endpoint } = conversation ?? {};

  if (!props.endpointKeyProvided) {
    return null;
  }

  if (endpoint === EModelEndpoint.assistants) {
    return <AssistantSwitcher {...props} />;
  }

  return <ModelSwitcher {...props} />;
}
