import { SelectDropDown } from '~/components/ui';
import { cn, cardStyle } from '~/utils/';
import type { TModelSelectProps } from '~/common';

export default function OpenAI({ conversation, setOption, models }: TModelSelectProps) {
  return (
    <SelectDropDown
      value={conversation?.model ?? ''}
      setValue={setOption('model')}
      availableValues={models}
      showAbove={true}
      showLabel={false}
      className={cn(
        cardStyle,
        'min-w-48 z-50 flex h-[40px] w-48 flex-none items-center justify-center px-4 hover:cursor-pointer',
      )}
    />
  );
}
