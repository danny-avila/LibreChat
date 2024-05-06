import { EModelEndpoint } from 'librechat-data-provider';
import type { SwitcherProps } from '~/common';
import { Separator } from '~/components/ui/Separator';
import AssistantSwitcher from './AssistantSwitcher';
import ModelSwitcher from './ModelSwitcher';

export default function Switcher(props: SwitcherProps) {
  if (props.endpoint === EModelEndpoint.assistants && props.endpointKeyProvided) {
    return (
      <>
        <AssistantSwitcher {...props} />
        <Separator className="bg-gray-100/50 dark:bg-gray-600" />
      </>
    );
  } else if (props.endpoint === EModelEndpoint.assistants) {
    return null;
  }

  return (
    <>
      <ModelSwitcher {...props} />
      <Separator className="bg-gray-100/50 dark:bg-gray-600" />
    </>
  );
}
