import { isAssistantsEndpoint, isAgentsEndpoint } from 'librechat-data-provider';
import type { SwitcherProps } from '~/common';
import AssistantSwitcher from './AssistantSwitcher';

export default function Switcher(props: SwitcherProps) {
  if (isAssistantsEndpoint(props.endpoint) && props.endpointKeyProvided) {
    return <AssistantSwitcher {...props} />;
  } else if (isAssistantsEndpoint(props.endpoint)) {
    return null;
  }

  return null;
}
