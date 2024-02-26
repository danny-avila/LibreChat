import { SelectDropDown, SelectDropDownPop } from '~/components/ui';
import type { TModelSelectProps } from '~/common';
import { cn, cardStyle } from '~/utils/';

export default function Anthropic({
  conversation,
  setOption,
  models,
  showAbove,
  popover = false,
}: TModelSelectProps) {
  const Menu = popover ? SelectDropDownPop : SelectDropDown;
  return (
    <Menu
      value={conversation?.model ?? ''}
      setValue={setOption('model')}
      availableValues={models}
      showAbove={showAbove}
      showLabel={false}
      className={cn(
        cardStyle,
        'min-w-48 z-50 flex h-[40px] w-48 flex-none items-center justify-center px-4 ring-0 hover:cursor-pointer',
      )}
    />
  );
}
