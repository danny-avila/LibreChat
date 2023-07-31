import { EModelEndpoint, PopoverButton } from 'librechat-data-provider';
import { MessagesSquared } from '~/components/svg';
import { useRecoilState } from 'recoil';
import { Button } from '~/components';
import { cn } from '~/utils/';
import store from '~/store';

export default function PopoverButtons({ endpoint }: { endpoint: EModelEndpoint }) {
  const [optionSettings, setOptionSettings] = useRecoilState(store.optionSettings);
  const { showExamples, isCodeChat } = optionSettings;
  const triggerExamples = () =>
    setOptionSettings((prev) => ({ ...prev, showExamples: !prev.showExamples }));
  const examplesButton = {
    label: (showExamples ? 'Hide' : 'Show') + ' Examples',
    buttonClass: isCodeChat ? 'disabled' : '',
    handler: triggerExamples,
    icon: <MessagesSquared className="mr-1 w-[14px]" />,
  };

  const buttons: { [key: string]: PopoverButton[] } = {
    google: [examplesButton],
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
