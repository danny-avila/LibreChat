import { EModelEndpoint } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import { MessagesSquared, GPTIcon } from '~/components/svg';
import { useChatContext } from '~/Providers';
import { Button } from '~/components/ui';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils/';

type TPopoverButton = {
  label: string;
  buttonClass: string;
  handler: () => void;
  icon: ReactNode;
};

export default function PopoverButtons({
  buttonClass,
  iconClass = '',
}: {
  buttonClass?: string;
  iconClass?: string;
}) {
  const {
    conversation,
    optionSettings,
    setOptionSettings,
    showAgentSettings,
    setShowAgentSettings,
  } = useChatContext();
  const localize = useLocalize();

  const { model, endpoint: _endpoint, endpointType } = conversation ?? {};
  const endpoint = endpointType ?? _endpoint;
  const isGenerativeModel = model?.toLowerCase()?.includes('gemini');
  const isChatModel = !isGenerativeModel && model?.toLowerCase()?.includes('chat');
  const isTextModel = !isGenerativeModel && !isChatModel && /code|text/.test(model ?? '');

  const { showExamples } = optionSettings;
  const showExamplesButton = !isGenerativeModel && !isTextModel && isChatModel;

  const triggerExamples = () =>
    setOptionSettings((prev) => ({ ...prev, showExamples: !prev.showExamples }));

  const buttons: { [key: string]: TPopoverButton[] } = {
    [EModelEndpoint.google]: [
      {
        label: localize(showExamples ? 'com_hide_examples' : 'com_show_examples'),
        buttonClass: isGenerativeModel || isTextModel ? 'disabled' : '',
        handler: triggerExamples,
        icon: <MessagesSquared className={cn('mr-1 w-[14px]', iconClass)} />,
      },
    ],
    [EModelEndpoint.gptPlugins]: [
      {
        label: localize(
          showAgentSettings ? 'com_show_completion_settings' : 'com_show_agent_settings',
        ),
        buttonClass: '',
        handler: () => setShowAgentSettings((prev) => !prev),
        icon: <GPTIcon className={cn('mr-1 w-[14px]', iconClass)} size={24} />,
      },
    ],
  };

  const endpointButtons = buttons[endpoint ?? ''];
  if (!endpointButtons) {
    return null;
  }

  if (endpoint === EModelEndpoint.google && !showExamplesButton) {
    return null;
  }

  return (
    <div>
      {endpointButtons.map((button, index) => (
        <Button
          key={`button-${index}`}
          type="button"
          className={cn(
            button.buttonClass,
            'ml-1 h-auto justify-start bg-transparent px-2 py-1 text-xs font-medium font-normal text-black hover:bg-slate-200 hover:text-black focus:ring-0 focus:ring-offset-0 dark:bg-transparent dark:text-white dark:hover:bg-gray-700 dark:hover:text-white dark:focus:outline-none dark:focus:ring-offset-0',
            buttonClass ?? '',
          )}
          onClick={button.handler}
        >
          {button.icon}
          {button.label}
        </Button>
      ))}
    </div>
  );
}
