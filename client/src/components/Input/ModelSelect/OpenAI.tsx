import { useRecoilValue } from 'recoil';
import { SelectDropDown } from '~/components/ui';
import { cn, cardStyle } from '~/utils/';
import store from '~/store';

export default function OpenAI({ conversation, setOption }: any) {
  const endpointsConfig = useRecoilValue(store.endpointsConfig);
  const models = endpointsConfig?.['openAI']?.['availableModels'] || [];

  return (
    <SelectDropDown
      value={conversation.model}
      setValue={setOption('model')}
      availableValues={models}
      showAbove={true}
      showLabel={false}
      className={cn(
        cardStyle,
        'min-w-48 z-50 flex h-[40px] w-48 flex-none items-center justify-center px-4 ring-0 hover:cursor-pointer hover:bg-slate-50 focus:ring-0 focus:ring-offset-0 data-[state=open]:bg-slate-50 dark:bg-gray-700 dark:hover:bg-gray-600 dark:data-[state=open]:bg-gray-600',
      )}
    />
  );
}
