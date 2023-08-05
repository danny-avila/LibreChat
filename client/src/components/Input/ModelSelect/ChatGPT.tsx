import { SelectDropDown } from '~/components/ui';
import { cn, cardStyle } from '~/utils/';
import type { TModelSelectProps } from '~/common';

export default function ChatGPT({ conversation, setOption, models }: TModelSelectProps) {
  if (!conversation) {
    return null;
  }
  const { conversationId, model } = conversation;
  if (conversationId !== 'new') {
    return null;
  }

  return (
    <SelectDropDown
      value={model ?? ''}
      setValue={setOption('model')}
      availableValues={models}
      showAbove={true}
      showLabel={false}
      className={cn(
        cardStyle,
        'min-w-48 z-50 flex h-[40px] w-60 flex-none items-center justify-center px-4 ring-0 hover:cursor-pointer',
      )}
    />
  );
}
