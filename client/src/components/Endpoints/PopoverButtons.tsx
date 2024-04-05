import { EModelEndpoint } from 'librechat-data-provider';
import { MessagesSquared, GPTIcon } from '~/components/svg';
import { useRecoilState } from 'recoil';
import { Button } from '~/components';
import { cn } from '~/utils/';
import store from '~/store';
import { useLocalize } from '~/hooks';

type TPopoverButton = {
  label: string;
  buttonClass: string;
  handler: () => void;
  icon: React.ReactNode;
};

export default function PopoverButtons({
  endpoint,
  buttonClass,
  iconClass = '',
}: {
  endpoint: EModelEndpoint | string;
  buttonClass?: string;
  iconClass?: string;
}) {
  const localize = useLocalize();
  const [optionSettings, setOptionSettings] = useRecoilState(store.optionSettings);
  const [showAgentSettings, setShowAgentSettings] = useRecoilState(store.showAgentSettings);
  const { showExamples, isCodeChat } = optionSettings;
  const triggerExamples = () =>
    setOptionSettings((prev) => ({ ...prev, showExamples: !prev.showExamples }));

  const buttons: { [key: string]: TPopoverButton[] } = {
    google: [
      {
        label:
          (showExamples ? localize('com_endpoint_hide') : localize('com_endpoint_show')) +
          localize('com_endpoint_examples'),
        buttonClass: isCodeChat ? 'disabled' : '',
        handler: triggerExamples,
        icon: <MessagesSquared className={cn('mr-1 w-[14px]', iconClass)} />,
      },
    ],
    gptPlugins: [
      {
        label: localize(
          'com_endpoint_show_what_settings',
          showAgentSettings ? localize('com_endpoint_completion') : localize('com_endpoint_agent'),
        ),
        buttonClass: '',
        handler: () => setShowAgentSettings((prev) => !prev),
        icon: <GPTIcon className={cn('mr-1 w-[14px]', iconClass)} size={24} />,
      },
    ],
  };

  const endpointButtons = buttons[endpoint];
  if (!endpointButtons) {
    return null;
  }

  return (
    <div>
      {endpointButtons.map((button, index) => (
        <Button
          key={`${endpoint}-button-${index}`}
          type="button"
          className={cn(
            button.buttonClass,
            'ml-1 h-auto justify-start bg-transparent px-2 py-1 text-xs font-medium font-normal text-black hover:bg-gray-100 hover:text-black focus:ring-0 focus:ring-offset-0 dark:bg-transparent dark:text-white dark:hover:bg-gray-700 dark:hover:text-white dark:focus:outline-none dark:focus:ring-offset-0',
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
