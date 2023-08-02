import { cn, optionText, defaultTextProps } from '~/utils/';
import { useRecoilValue } from 'recoil';
import {
  Switch,
  SelectDropDown,
  Label,
  Slider,
  InputNumber,
  HoverCard,
  HoverCardTrigger,
} from '~/components';
import OptionHover from './OptionHover';
import { ModelSelectProps, Side } from 'librechat-data-provider';
import { localize } from '~/localization/Translation';
import store from '~/store';

export default function Settings({ conversation, setOption, models, readonly }: ModelSelectProps) {
  const { agent, skipCompletion, model, temperature } = conversation.agentOptions ?? {};
  const lang = useRecoilValue(store.lang);

  const setModel = setOption('model');
  const setTemperature = setOption('temperature');
  const setAgent = setOption('agent');
  const setSkipCompletion = setOption('skipCompletion');
  const onCheckedChangeAgent = (checked: boolean) => {
    setAgent(checked ? 'functions' : 'classic');
  };

  const onCheckedChangeSkip = (checked: boolean) => {
    setSkipCompletion(checked);
  };

  return (
    <div className="h-[490px] overflow-y-auto sm:h-[350px] md:h-[350px]">
      <div className="grid gap-6 sm:grid-cols-5">
        <div className="col-span-3 flex flex-col items-center justify-start gap-6">
          <div className="grid w-full items-center gap-2">
            <SelectDropDown
              title={localize(lang, 'com_endpoint_agent_model')}
              value={model ?? ''}
              setValue={setModel}
              availableValues={models}
              disabled={readonly}
              className={cn(
                defaultTextProps,
                'flex w-full resize-none focus:outline-none focus:ring-0 focus:ring-opacity-0 focus:ring-offset-0',
              )}
              containerClassName="flex w-full resize-none"
            />
          </div>
        </div>
        <div className="col-span-2 flex flex-col items-center justify-start gap-6 px-3">
          <HoverCard openDelay={300}>
            <HoverCardTrigger className="grid w-full items-center gap-2">
              <div className="flex justify-between">
                <Label htmlFor="temp-int" className="text-left text-sm font-medium">
                  {localize(lang, 'com_endpoint_temperature')}{' '}
                  <small className="opacity-40">
                    ({localize(lang, 'com_endpoint_default')}: 0)
                  </small>
                </Label>
                <InputNumber
                  id="temp-int"
                  disabled={readonly}
                  value={temperature}
                  onChange={(value) => setTemperature(Number(value))}
                  max={2}
                  min={0}
                  step={0.01}
                  controls={false}
                  className={cn(
                    defaultTextProps,
                    cn(
                      optionText,
                      'reset-rc-number-input reset-rc-number-input-text-right h-auto w-12 border-0 group-hover/temp:border-gray-200',
                    ),
                  )}
                />
              </div>
              <Slider
                disabled={readonly}
                value={[temperature ?? 0]}
                onValueChange={(value) => setTemperature(value[0])}
                doubleClickHandler={() => setTemperature(1)}
                max={2}
                min={0}
                step={0.01}
                className="flex h-4 w-full"
              />
            </HoverCardTrigger>
            <OptionHover endpoint={conversation.endpoint ?? ''} type="temp" side={Side.Left} />
          </HoverCard>
          <div className="grid w-full grid-cols-2 items-center gap-10">
            <HoverCard openDelay={500}>
              <HoverCardTrigger className="w-[100px]">
                <label
                  htmlFor="functions-agent"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 dark:text-gray-50"
                >
                  <small>{localize(lang, 'com_endpoint_plug_use_functions')}</small>
                </label>
                <Switch
                  id="functions-agent"
                  checked={agent === 'functions'}
                  onCheckedChange={onCheckedChangeAgent}
                  disabled={readonly}
                  className="ml-4 mt-2"
                />
              </HoverCardTrigger>
              <OptionHover endpoint={conversation.endpoint ?? ''} type="func" side={Side.Bottom} />
            </HoverCard>
            <HoverCard openDelay={500}>
              <HoverCardTrigger className="ml-[-60px] w-[100px]">
                <label
                  htmlFor="skip-completion"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 dark:text-gray-50"
                >
                  <small>{localize(lang, 'com_endpoint_plug_skip_completion')}</small>
                </label>
                <Switch
                  id="skip-completion"
                  checked={skipCompletion === true}
                  onCheckedChange={onCheckedChangeSkip}
                  disabled={readonly}
                  className="ml-4 mt-2"
                />
              </HoverCardTrigger>
              <OptionHover endpoint={conversation.endpoint ?? ''} type="skip" side={Side.Bottom} />
            </HoverCard>
          </div>
          {/* <HoverCard openDelay={300}>
            <HoverCardTrigger className="grid w-full items-center gap-2">
              <div className="flex justify-between">
                <Label htmlFor="top-p-int" className="text-left text-sm font-medium">
                  Top P <small className="opacity-40">(default: 1)</small>
                </Label>
                <InputNumber
                  id="top-p-int"
                  disabled={readonly}
                  value={topP}
                  onChange={(value) => setTopP(value)}
                  max={1}
                  min={0}
                  step={0.01}
                  controls={false}
                  className={cn(
                    defaultTextProps,
                    cn(
                      optionText,
                      'reset-rc-number-input reset-rc-number-input-text-right h-auto w-12 border-0 group-hover/temp:border-gray-200'
                    )
                  )}
                />
              </div>
              <Slider
                disabled={readonly}
                value={[topP]}
                onValueChange={(value) => setTopP(value[0])}
                doubleClickHandler={() => setTopP(1)}
                max={1}
                min={0}
                step={0.01}
                className="flex h-4 w-full"
              />
            </HoverCardTrigger>
            <OptionHover type="topp" side="left" />
          </HoverCard>

          <HoverCard openDelay={300}>
            <HoverCardTrigger className="grid w-full items-center gap-2">
              <div className="flex justify-between">
                <Label htmlFor="freq-penalty-int" className="text-left text-sm font-medium">
                  Frequency Penalty <small className="opacity-40">(default: 0)</small>
                </Label>
                <InputNumber
                  id="freq-penalty-int"
                  disabled={readonly}
                  value={freqP}
                  onChange={(value) => setFreqP(value)}
                  max={2}
                  min={-2}
                  step={0.01}
                  controls={false}
                  className={cn(
                    defaultTextProps,
                    cn(
                      optionText,
                      'reset-rc-number-input reset-rc-number-input-text-right h-auto w-12 border-0 group-hover/temp:border-gray-200'
                    )
                  )}
                />
              </div>
              <Slider
                disabled={readonly}
                value={[freqP]}
                onValueChange={(value) => setFreqP(value[0])}
                doubleClickHandler={() => setFreqP(0)}
                max={2}
                min={-2}
                step={0.01}
                className="flex h-4 w-full"
              />
            </HoverCardTrigger>
            <OptionHover type="freq" side="left" />
          </HoverCard>

          <HoverCard openDelay={300}>
            <HoverCardTrigger className="grid w-full items-center gap-2">
              <div className="flex justify-between">
                <Label htmlFor="pres-penalty-int" className="text-left text-sm font-medium">
                  Presence Penalty <small className="opacity-40">(default: 0)</small>
                </Label>
                <InputNumber
                  id="pres-penalty-int"
                  disabled={readonly}
                  value={presP}
                  onChange={(value) => setPresP(value)}
                  max={2}
                  min={-2}
                  step={0.01}
                  controls={false}
                  className={cn(
                    defaultTextProps,
                    cn(
                      optionText,
                      'reset-rc-number-input reset-rc-number-input-text-right h-auto w-12 border-0 group-hover/temp:border-gray-200'
                    )
                  )}
                />
              </div>
              <Slider
                disabled={readonly}
                value={[presP]}
                onValueChange={(value) => setPresP(value[0])}
                doubleClickHandler={() => setPresP(0)}
                max={2}
                min={-2}
                step={0.01}
                className="flex h-4 w-full"
              />
            </HoverCardTrigger>
            <OptionHover type="pres" side="left" />
          </HoverCard> */}
        </div>
      </div>
    </div>
  );
}
