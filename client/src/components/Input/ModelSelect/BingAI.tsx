import { useRecoilValue } from 'recoil';
import { SelectDropDown, Tabs, TabsList, TabsTrigger } from '~/components/ui';
import { cn, cardStyle } from '~/utils/';
import { ModelSelectProps } from 'librechat-data-provider';
import store from '~/store';

export default function BingAI({ conversation, setOption, models }: ModelSelectProps) {
  const showBingToneSetting = useRecoilValue(store.showBingToneSetting);
  const { conversationId, toneStyle, jailbreak } = conversation;
  if (conversationId !== 'new' && !showBingToneSetting) {
    return null;
  }

  const defaultClasses =
    'p-2 rounded-md min-w-[75px] font-normal bg-white/[.60] dark:bg-gray-700 text-black text-xs';
  const defaultSelected = cn(
    defaultClasses,
    'font-medium data-[state=active]:text-white text-xs text-white',
  );
  const selectedClass = (val: string) => val + '-tab ' + defaultSelected;

  return (
    <>
      <SelectDropDown
        title="Mode"
        value={jailbreak ? 'Sydney' : 'BingAI'}
        data-testid="bing-select-dropdown"
        setValue={(value) => setOption('jailbreak')(value === 'Sydney')}
        availableValues={models}
        showAbove={true}
        showLabel={false}
        className={cn(
          cardStyle,
          'min-w-36 z-50 flex h-[40px] w-36 flex-none items-center justify-center px-4 ring-0 hover:cursor-pointer hover:bg-slate-50 focus:ring-0 focus:ring-offset-0 data-[state=open]:bg-slate-50 dark:bg-gray-700 dark:hover:bg-gray-600 dark:data-[state=open]:bg-gray-600',
          showBingToneSetting ? 'hidden' : '',
        )}
      />
      <Tabs
        value={toneStyle}
        className={
          cardStyle +
          ' z-50 flex h-[40px] flex-none items-center justify-center px-0 hover:bg-slate-50 dark:hover:bg-gray-600'
        }
        onValueChange={(value) => setOption('toneStyle')(value.toLowerCase())}
      >
        <TabsList className="bg-white/[.60] dark:bg-gray-700">
          <TabsTrigger
            value="creative"
            className={`${toneStyle === 'creative' ? selectedClass('creative') : defaultClasses}`}
          >
            {'Creative'}
          </TabsTrigger>
          <TabsTrigger
            value="fast"
            className={`${toneStyle === 'fast' ? selectedClass('fast') : defaultClasses}`}
          >
            {'Fast'}
          </TabsTrigger>
          <TabsTrigger
            value="balanced"
            className={`${toneStyle === 'balanced' ? selectedClass('balanced') : defaultClasses}`}
          >
            {'Balanced'}
          </TabsTrigger>
          <TabsTrigger
            value="precise"
            className={`${toneStyle === 'precise' ? selectedClass('precise') : defaultClasses}`}
          >
            {'Precise'}
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </>
  );
}
