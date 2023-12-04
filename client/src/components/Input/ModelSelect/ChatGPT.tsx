import { SelectDropDown, SelectDropDownPop } from '~/components/ui';
import type { TModelSelectProps } from '~/common';
import { cn, cardStyle } from '~/utils/';

export default function ChatGPT({
  conversation,
  setOption,
  models,
  showAbove,
  popover = false,
}: TModelSelectProps) {
  if (!conversation) {
    return null;
  }
  const { conversationId, model } = conversation;
  if (conversationId !== 'new') {
    return null;
  }
  const Menu = popover ? SelectDropDownPop : SelectDropDown;
  return (
    <Menu
      value={model ?? ''}
      setValue={setOption('model')}
      availableValues={models}
      showAbove={showAbove}
      showLabel={false}
      className={cn(
        cardStyle,
        'min-w-48 z-50 flex h-[40px] w-60 flex-none items-center justify-center px-4 ring-0 hover:cursor-pointer',
      )}
    />
  );
}
