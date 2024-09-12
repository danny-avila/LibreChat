import { isAssistantsEndpoint, isAgentsEndpoint } from 'librechat-data-provider';
import type { SwitcherProps } from '~/common';
import { Separator } from '~/components/ui/Separator';
import AssistantSwitcher from './AssistantSwitcher';
import AgentSwitcher from './AgentSwitcher';
import ModelSwitcher from './ModelSwitcher';

export default function Switcher(props: SwitcherProps) {
  if (isAssistantsEndpoint(props.endpoint) && props.endpointKeyProvided) {
    return (
      <>
        <AssistantSwitcher {...props} />
        <Separator className="max-w-[98%] bg-surface-tertiary" />
      </>
    );
  } else if (isAgentsEndpoint(props.endpoint) && props.endpointKeyProvided) {
    return (
      <>
        <AgentSwitcher {...props} />
        <Separator className="bg-gray-100/50 dark:bg-gray-600" />
      </>
    );
  } else if (isAssistantsEndpoint(props.endpoint)) {
    return null;
  }

  return (
    <>
      <ModelSwitcher {...props} />
      <Separator className="max-w-[98%] bg-surface-tertiary" />
    </>
  );
}
