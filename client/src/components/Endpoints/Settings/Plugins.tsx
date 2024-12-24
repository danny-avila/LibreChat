import { useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import TextareaAutosize from 'react-textarea-autosize';
import { useAvailablePluginsQuery } from 'librechat-data-provider/react-query';
import type { TPlugin } from 'librechat-data-provider';
import type { TModelSelectProps, OnInputNumberChange } from '~/common';
import {
  Input,
  Label,
  Slider,
  HoverCard,
  InputNumber,
  SelectDropDown,
  HoverCardTrigger,
  MultiSelectDropDown,
} from '~/components/ui';
import {
  removeFocusOutlines,
  defaultTextProps,
  removeFocusRings,
  processPlugins,
  selectPlugins,
  optionText,
  cn,
} from '~/utils';
import OptionHoverAlt from '~/components/SidePanel/Parameters/OptionHover';
import { useLocalize, useDebouncedInput } from '~/hooks';
import OptionHover from './OptionHover';
import { ESide } from '~/common';
import store from '~/store';

export default function Settings({
  conversation,
  setOption,
  setTools,
  checkPluginSelection,
  models,
  readonly,
}: TModelSelectProps & {
  setTools: (newValue: string, remove?: boolean | undefined) => void;
  checkPluginSelection: (value: string) => boolean;
}) {
  const localize = useLocalize();
  const availableTools = useRecoilValue(store.availableTools);
  const { data: allPlugins } = useAvailablePluginsQuery({
    select: selectPlugins,
  });

  const conversationTools: TPlugin[] = useMemo(() => {
    if (!conversation?.tools) {
      return [];
    }
    return processPlugins(conversation.tools, allPlugins?.map);
  }, [conversation, allPlugins]);

  const availablePlugins = useMemo(() => {
    if (!availableTools) {
      return [];
    }

    return Object.values(availableTools);
  }, [availableTools]);

  const {
    model,
    modelLabel,
    chatGptLabel,
    promptPrefix,
    temperature,
    top_p: topP,
    frequency_penalty: freqP,
    presence_penalty: presP,
    maxContextTokens,
  } = conversation ?? {};

  const [setChatGptLabel, chatGptLabelValue] = useDebouncedInput<string | null | undefined>({
    setOption,
    optionKey: 'chatGptLabel',
    initialValue: modelLabel ?? chatGptLabel,
  });
  const [setPromptPrefix, promptPrefixValue] = useDebouncedInput<string | null | undefined>({
    setOption,
    optionKey: 'promptPrefix',
    initialValue: promptPrefix,
  });
  const [setTemperature, temperatureValue] = useDebouncedInput<number | null | undefined>({
    setOption,
    optionKey: 'temperature',
    initialValue: temperature,
  });
  const [setTopP, topPValue] = useDebouncedInput<number | null | undefined>({
    setOption,
    optionKey: 'top_p',
    initialValue: topP,
  });
  const [setFreqP, freqPValue] = useDebouncedInput<number | null | undefined>({
    setOption,
    optionKey: 'frequency_penalty',
    initialValue: freqP,
  });
  const [setPresP, presPValue] = useDebouncedInput<number | null | undefined>({
    setOption,
    optionKey: 'presence_penalty',
    initialValue: presP,
  });
  const [setMaxContextTokens, maxContextTokensValue] = useDebouncedInput<number | null | undefined>(
    {
      setOption,
      optionKey: 'maxContextTokens',
      initialValue: maxContextTokens,
    },
  );

  const setModel = setOption('model');

  if (!conversation) {
    return null;
  }

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
            className={cn(defaultTextProps, 'flex w-full resize-none', removeFocusRings)}
            containerClassName="flex w-full resize-none"
          />
        </div>
        <>
          <div className="grid w-full items-center gap-2">
            <Label htmlFor="chatGptLabel" className="text-left text-sm font-medium">
              {localize('com_endpoint_custom_name')}{' '}
              <small className="opacity-40">{localize('com_endpoint_default_empty')}</small>
            </Label>
            <Input
              id="chatGptLabel"
              disabled={readonly}
              value={chatGptLabelValue || ''}
              onChange={(e) => setChatGptLabel(e.target.value ?? null)}
              placeholder={localize('com_endpoint_openai_custom_name_placeholder')}
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
              <small className="opacity-40">{localize('com_endpoint_default_empty')}</small>
            </Label>
            <TextareaAutosize
              id="promptPrefix"
              disabled={readonly}
              value={promptPrefixValue || ''}
              onChange={(e) => setPromptPrefix(e.target.value ?? null)}
              placeholder={localize(
                'com_endpoint_plug_set_custom_instructions_for_gpt_placeholder',
              )}
              className={cn(
                defaultTextProps,
                'flex max-h-[138px] min-h-[100px] w-full resize-none px-3 py-2 ',
              )}
            />
          </div>
        </>
      </div>
      <div className="col-span-5 flex flex-col items-center justify-start gap-6 px-3 sm:col-span-2">
        <MultiSelectDropDown
          showAbove={false}
          showLabel={false}
          setSelected={setTools}
          value={conversationTools}
          optionValueKey="pluginKey"
          availableValues={availablePlugins}
          isSelected={checkPluginSelection}
          searchPlaceholder={localize('com_ui_select_search_plugin')}
          className={cn(defaultTextProps, 'flex w-full resize-none', removeFocusOutlines)}
          optionsClassName="w-full max-h-[275px] dark:bg-gray-700 z-10 border dark:border-gray-600"
          containerClassName="flex w-full resize-none border border-transparent"
          labelClassName="dark:text-white"
        />
        <HoverCard openDelay={300}>
          <HoverCardTrigger className="grid w-full items-center gap-2">
            <div className="mt-1 flex w-full justify-between">
              <Label htmlFor="max-context-tokens" className="text-left text-sm font-medium">
                {localize('com_endpoint_context_tokens')}{' '}
              </Label>
              <InputNumber
                id="max-context-tokens"
                stringMode={false}
                disabled={readonly}
                value={maxContextTokensValue as number}
                onChange={setMaxContextTokens as OnInputNumberChange}
                placeholder={localize('com_nav_theme_system')}
                min={10}
                max={2000000}
                step={1000}
                controls={false}
                className={cn(
                  defaultTextProps,
                  cn(
                    optionText,
                    'reset-rc-number-input reset-rc-number-input-text-right h-auto w-12 border-0 group-hover/temp:border-gray-200',
                    'w-1/3',
                  ),
                )}
              />
            </div>
          </HoverCardTrigger>
          <OptionHoverAlt
            description="com_endpoint_context_info"
            langCode={true}
            side={ESide.Left}
          />
        </HoverCard>
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
                value={temperatureValue}
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
              value={[temperatureValue ?? 0.8]}
              onValueChange={(value) => setTemperature(value[0])}
              onDoubleClick={() => setTemperature(0.8)}
              max={2}
              min={0}
              step={0.01}
              className="flex h-4 w-full"
            />
          </HoverCardTrigger>
          <OptionHover endpoint={conversation.endpoint ?? ''} type="temp" side={ESide.Left} />
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
                value={topPValue}
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
              value={[topPValue ?? 1]}
              onValueChange={(value) => setTopP(value[0])}
              onDoubleClick={() => setTopP(1)}
              max={1}
              min={0}
              step={0.01}
              className="flex h-4 w-full"
            />
          </HoverCardTrigger>
          <OptionHover endpoint={conversation.endpoint ?? ''} type="topp" side={ESide.Left} />
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
                value={freqPValue}
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
              value={[freqPValue ?? 0]}
              onValueChange={(value) => setFreqP(value[0])}
              onDoubleClick={() => setFreqP(0)}
              max={2}
              min={-2}
              step={0.01}
              className="flex h-4 w-full"
            />
          </HoverCardTrigger>
          <OptionHover endpoint={conversation.endpoint ?? ''} type="freq" side={ESide.Left} />
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
                value={presPValue}
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
              value={[presPValue ?? 0]}
              onValueChange={(value) => setPresP(value[0])}
              onDoubleClick={() => setPresP(0)}
              max={2}
              min={-2}
              step={0.01}
              className="flex h-4 w-full"
            />
          </HoverCardTrigger>
          <OptionHover endpoint={conversation.endpoint ?? ''} type="pres" side={ESide.Left} />
        </HoverCard>
      </div>
    </div>
  );
}
