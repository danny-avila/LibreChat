import { EModelEndpoint } from 'librechat-data-provider';
import type { SwitcherProps } from '~/common';
import AssistantSwitcher from './AssistantSwitcher';
import ModelSwitcher from './ModelSwitcher';

export default function Switcher(props: SwitcherProps) {
  if (props.endpoint === EModelEndpoint.assistants && props.endpointKeyProvided) {
    return <AssistantSwitcher {...props} />;
  } else if (props.endpoint === EModelEndpoint.assistants) {
    return null;
  }

  return <ModelSwitcher {...props} />;
}
