import { EModelEndpoint, PopoverButton } from 'librechat-data-provider';
import { MessagesSquared, GPTIcon } from '~/components/svg';
import { useRecoilState } from 'recoil';
import { Button } from '~/components';
import { cn } from '~/utils/';
import store from '~/store';

export default function PopoverButtons({ endpoint }: { endpoint: EModelEndpoint }) {
  const [optionSettings, setOptionSettings] = useRecoilState(store.optionSettings);
  const [showAgentSettings, setShowAgentSettings] = useRecoilState(store.showAgentSettings);
  const { showExamples, isCodeChat } = optionSettings;
  const triggerExamples = () =>
    setOptionSettings((prev) => ({ ...prev, showExamples: !prev.showExamples }));

  const buttons: { [key: string]: PopoverButton[] } = {
    google: [
      {
        label: (showExamples ? 'Hide' : 'Show') + ' Examples',
        buttonClass: isCodeChat ? 'disabled' : '',
        handler: triggerExamples,
        icon: <MessagesSquared className="mr-1 w-[14px]" />,
      },
    ],
    gptPlugins: [
      {
        label: `Show ${showAgentSettings ? 'Completion' : 'Agent'} Settings`,
        buttonClass: '',
        handler: () => setShowAgentSettings((prev) => !prev),
        icon: <GPTIcon className="mr-1 mt-[2px] w-[14px]" size={14} />,
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
            'ml-1 h-auto justify-start bg-transparent px-2 py-1 text-xs font-medium font-normal text-black hover:bg-slate-200 hover:text-black focus:ring-0 focus:ring-offset-0 dark:bg-transparent dark:text-white dark:hover:bg-gray-700 dark:hover:text-white dark:focus:outline-none dark:focus:ring-offset-0',
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
