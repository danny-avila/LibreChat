import TextareaAutosize from 'react-textarea-autosize';
import {
  SelectDropDown,
  Input,
  Label,
  Slider,
  InputNumber,
  HoverCard,
  HoverCardTrigger,
} from '~/components';
import OptionHover from './OptionHover';
import { ESide, TModelSelectProps } from '~/common';
import { cn, defaultTextProps, optionText, removeFocusOutlines } from '~/utils/';
import { useLocalize } from '~/hooks';

export default function Settings({ conversation, setOption, models, readonly }: TModelSelectProps) {
  const localize = useLocalize();
  if (!conversation) {
    return null;
  }
  const {
    model,
    chatGptLabel,
    promptPrefix,
    temperature,
    top_p: topP,
    frequency_penalty: freqP,
    presence_penalty: presP,
    tools,
  } = conversation;

  const setModel = setOption('model');
  const setChatGptLabel = setOption('chatGptLabel');
  const setPromptPrefix = setOption('promptPrefix');
  const setTemperature = setOption('temperature');
  const setTopP = setOption('top_p');
  const setFreqP = setOption('frequency_penalty');
  const setPresP = setOption('presence_penalty');

  const toolsSelected = tools && tools.length > 0;

  return (
    <div className="grid grid-cols-5 gap-6">
      <div className="col-span-5 flex flex-col items-center justify-start gap-6 sm:col-span-3">
        <div className="grid w-full items-center gap-2">
          <SelectDropDown
            title={localize('com_endpoint_completion_model')}
            value={model ?? ''}
            setValue={setModel}
            availableValues={models}
            disabled={readonly}
            className={cn(defaultTextProps, 'flex w-full resize-none', removeFocusOutlines)}
            containerClassName="flex w-full resize-none"
          />
        </div>
        <>
          <div className="grid w-full items-center gap-2">
            <Label htmlFor="chatGptLabel" className="text-left text-sm font-medium">
              {localize('com_endpoint_custom_name')}{' '}
              <small className="opacity-40">
                ({localize('com_endpoint_default_empty')} |{' '}
                {localize('com_endpoint_disabled_with_tools')})
              </small>
            </Label>
            <Input
              id="chatGptLabel"
              disabled={readonly || toolsSelected}
              value={chatGptLabel || ''}
              onChange={(e) => setChatGptLabel(e.target.value ?? null)}
              placeholder={
                toolsSelected
                  ? localize('com_endpoint_disabled_with_tools_placeholder')
                  : localize('com_endpoint_openai_custom_name_placeholder')
              }
              className={cn(
                defaultTextProps,
                'flex h-10 max-h-10 w-full resize-none px-3 py-2',
                removeFocusOutlines,
              )}
            />
          </div>
          <div className="grid w-full items-center gap-2">
            <Label htmlFor="promptPrefix" className="text-left text-sm font-medium">
              {localize('com_endpoint_prompt_prefix')}{' '}
              <small className="opacity-40">
                ({localize('com_endpoint_default_empty')} |{' '}
                {localize('com_endpoint_disabled_with_tools')})
              </small>
            </Label>
            <TextareaAutosize
              id="promptPrefix"
              disabled={readonly || toolsSelected}
              value={promptPrefix || ''}
              onChange={(e) => setPromptPrefix(e.target.value ?? null)}
              placeholder={
                toolsSelected
                  ? localize('com_endpoint_disabled_with_tools_placeholder')
                  : localize('com_endpoint_plug_set_custom_instructions_for_gpt_placeholder')
              }
              className={cn(
                defaultTextProps,
                'flex max-h-[300px] min-h-[100px] w-full resize-none px-3 py-2 ',
              )}
            />
          </div>
        </>
      </div>
      <div className="col-span-5 flex flex-col items-center justify-start gap-6 px-3 sm:col-span-2">
        <HoverCard openDelay={300}>
          <HoverCardTrigger className="grid w-full items-center gap-2">
            <div className="flex justify-between">
              <Label htmlFor="temp-int" className="text-left text-sm font-medium">
                {localize('com_endpoint_temperature')}{' '}
                <small className="opacity-40">
                  ({localize('com_endpoint_default_with_num', '0.8')})
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
              value={[temperature ?? 0.8]}
              onValueChange={(value) => setTemperature(value[0])}
              doubleClickHandler={() => setTemperature(0.8)}
              max={2}
              min={0}
              step={0.01}
              className="flex h-4 w-full"
            />
          </HoverCardTrigger>
          <OptionHover endpoint={conversation?.endpoint ?? ''} type="temp" side={ESide.Left} />
        </HoverCard>
        <HoverCard openDelay={300}>
          <HoverCardTrigger className="grid w-full items-center gap-2">
            <div className="flex justify-between">
              <Label htmlFor="top-p-int" className="text-left text-sm font-medium">
                {localize('com_endpoint_top_p')}{' '}
                <small className="opacity-40">
                  ({localize('com_endpoint_default_with_num', '1')})
                </small>
              </Label>
              <InputNumber
                id="top-p-int"
                disabled={readonly}
                value={topP}
                onChange={(value) => setTopP(Number(value))}
                max={1}
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
              value={[topP ?? 1]}
              onValueChange={(value) => setTopP(value[0])}
              doubleClickHandler={() => setTopP(1)}
              max={1}
              min={0}
              step={0.01}
              className="flex h-4 w-full"
            />
          </HoverCardTrigger>
          <OptionHover endpoint={conversation?.endpoint ?? ''} type="topp" side={ESide.Left} />
        </HoverCard>

        <HoverCard openDelay={300}>
          <HoverCardTrigger className="grid w-full items-center gap-2">
            <div className="flex justify-between">
              <Label htmlFor="freq-penalty-int" className="text-left text-sm font-medium">
                {localize('com_endpoint_frequency_penalty')}{' '}
                <small className="opacity-40">
                  ({localize('com_endpoint_default_with_num', '0')})
                </small>
              </Label>
              <InputNumber
                id="freq-penalty-int"
                disabled={readonly}
                value={freqP}
                onChange={(value) => setFreqP(Number(value))}
                max={2}
                min={-2}
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
              value={[freqP ?? 0]}
              onValueChange={(value) => setFreqP(value[0])}
              doubleClickHandler={() => setFreqP(0)}
              max={2}
              min={-2}
              step={0.01}
              className="flex h-4 w-full"
            />
          </HoverCardTrigger>
          <OptionHover endpoint={conversation?.endpoint ?? ''} type="freq" side={ESide.Left} />
        </HoverCard>

        <HoverCard openDelay={300}>
          <HoverCardTrigger className="grid w-full items-center gap-2">
            <div className="flex justify-between">
              <Label htmlFor="pres-penalty-int" className="text-left text-sm font-medium">
                {localize('com_endpoint_presence_penalty')}{' '}
                <small className="opacity-40">
                  ({localize('com_endpoint_default_with_num', '0')})
                </small>
              </Label>
              <InputNumber
                id="pres-penalty-int"
                disabled={readonly}
                value={presP}
                onChange={(value) => setPresP(Number(value))}
                max={2}
                min={-2}
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
              value={[presP ?? 0]}
              onValueChange={(value) => setPresP(value[0])}
              doubleClickHandler={() => setPresP(0)}
              max={2}
              min={-2}
              step={0.01}
              className="flex h-4 w-full"
            />
          </HoverCardTrigger>
          <OptionHover endpoint={conversation?.endpoint ?? ''} type="pres" side={ESide.Left} />
        </HoverCard>
      </div>
    </div>
  );
}
