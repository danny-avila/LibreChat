import { useMemo } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import {
  openAISettings,
  EModelEndpoint,
  imageDetailValue,
  imageDetailNumeric,
} from 'librechat-data-provider';
import type { TModelSelectProps, OnInputNumberChange } from '~/common';
import {
  Input,
  Label,
  Switch,
  Slider,
  HoverCard,
  InputNumber,
  SelectDropDown,
  HoverCardTrigger,
} from '~/components/ui';
import { cn, defaultTextProps, optionText, removeFocusOutlines, removeFocusRings } from '~/utils';
import { OptionHoverAlt, DynamicTags } from '~/components/SidePanel/Parameters';
import { useLocalize, useDebouncedInput } from '~/hooks';
import OptionHover from './OptionHover';
import { ESide } from '~/common';

export default function Settings({ conversation, setOption, models, readonly }: TModelSelectProps) {
  const localize = useLocalize();
  const {
    endpoint,
    endpointType,
    model,
    modelLabel,
    chatGptLabel,
    promptPrefix,
    temperature,
    top_p: topP,
    frequency_penalty: freqP,
    presence_penalty: presP,
    resendFiles,
    imageDetail,
    maxContextTokens,
    max_tokens,
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
  const [setMaxOutputTokens, maxOutputTokensValue] = useDebouncedInput<number | null | undefined>({
    setOption,
    optionKey: 'max_tokens',
    initialValue: max_tokens,
  });

  const optionEndpoint = useMemo(() => endpointType ?? endpoint, [endpoint, endpointType]);
  const isOpenAI = useMemo(
    () => optionEndpoint === EModelEndpoint.openAI || optionEndpoint === EModelEndpoint.azureOpenAI,
    [optionEndpoint],
  );

  if (!conversation) {
    return null;
  }

  const setModel = setOption('model');
  const setResendFiles = setOption('resendFiles');
  const setImageDetail = setOption('imageDetail');

  return (
    <div className="grid grid-cols-5 gap-6">
      <div className="col-span-5 flex flex-col items-center justify-start gap-6 sm:col-span-3">
        <div className="grid w-full items-center gap-2">
          <SelectDropDown
            value={model ?? ''}
            setValue={setModel}
            availableValues={models}
            disabled={readonly}
            className={cn(defaultTextProps, 'flex w-full resize-none', removeFocusRings)}
            containerClassName="flex w-full resize-none"
          />
        </div>
        <div className="grid w-full items-center gap-2">
          <Label htmlFor="chatGptLabel" className="text-left text-sm font-medium">
            {localize('com_endpoint_custom_name')}{' '}
            <small className="opacity-40">({localize('com_endpoint_default_blank')})</small>
          </Label>
          <Input
            id="chatGptLabel"
            disabled={readonly}
            value={(chatGptLabelValue as string) || ''}
            onChange={setChatGptLabel}
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
            <small className="opacity-40">({localize('com_endpoint_default_blank')})</small>
          </Label>
          <TextareaAutosize
            id="promptPrefix"
            disabled={readonly}
            value={(promptPrefixValue as string) || ''}
            onChange={setPromptPrefix}
            placeholder={localize('com_endpoint_openai_prompt_prefix_placeholder')}
            className={cn(
              defaultTextProps,
              'flex max-h-[138px] min-h-[100px] w-full resize-none px-3 py-2 transition-colors focus:outline-none',
            )}
          />
        </div>
        <div className="grid w-full items-start gap-2">
          <DynamicTags
            settingKey="stop"
            setOption={setOption}
            label="com_endpoint_stop"
            labelCode={true}
            description="com_endpoint_openai_stop"
            descriptionCode={true}
            placeholder="com_endpoint_stop_placeholder"
            placeholderCode={true}
            descriptionSide="right"
            maxTags={isOpenAI ? 4 : undefined}
            conversation={conversation}
            readonly={readonly}
          />
        </div>
      </div>
      <div className="col-span-5 flex flex-col items-center justify-start gap-6 px-3 sm:col-span-2">
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
            <div className="mt-1 flex w-full justify-between">
              <Label htmlFor="max-output-tokens" className="text-left text-sm font-medium">
                {localize('com_endpoint_max_output_tokens')}{' '}
              </Label>
              <InputNumber
                id="max-output-tokens"
                stringMode={false}
                disabled={readonly}
                value={maxOutputTokensValue as number}
                onChange={setMaxOutputTokens as OnInputNumberChange}
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
            description="com_endpoint_openai_max_tokens"
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
                  (
                  {localize(
                    'com_endpoint_default_with_num',
                    openAISettings.temperature.default + '',
                  )}
                  )
                </small>
              </Label>
              <InputNumber
                id="temp-int"
                stringMode={false}
                disabled={readonly}
                value={temperatureValue as number}
                onChange={setTemperature as OnInputNumberChange}
                max={openAISettings.temperature.max}
                min={openAISettings.temperature.min}
                step={openAISettings.temperature.step}
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
              value={[temperatureValue ?? openAISettings.temperature.default]}
              onValueChange={(value) => setTemperature(value[0])}
              doubleClickHandler={() => setTemperature(openAISettings.temperature.default)}
              max={openAISettings.temperature.max}
              min={openAISettings.temperature.min}
              step={openAISettings.temperature.step}
              className="flex h-4 w-full"
            />
          </HoverCardTrigger>
          <OptionHover endpoint={optionEndpoint ?? ''} type="temp" side={ESide.Left} />
        </HoverCard>
        <HoverCard openDelay={300}>
          <HoverCardTrigger className="grid w-full items-center gap-2">
            <div className="flex justify-between">
              <Label htmlFor="top-p-int" className="text-left text-sm font-medium">
                {localize('com_endpoint_top_p')}{' '}
                <small className="opacity-40">
                  ({localize('com_endpoint_default_with_num', openAISettings.top_p.default + '')})
                </small>
              </Label>
              <InputNumber
                id="top-p-int"
                disabled={readonly}
                value={topPValue as number}
                onChange={(value) => setTopP(Number(value))}
                max={openAISettings.top_p.max}
                min={openAISettings.top_p.min}
                step={openAISettings.top_p.step}
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
              value={[topPValue ?? openAISettings.top_p.default]}
              onValueChange={(value) => setTopP(value[0])}
              doubleClickHandler={() => setTopP(openAISettings.top_p.default)}
              max={openAISettings.top_p.max}
              min={openAISettings.top_p.min}
              step={openAISettings.top_p.step}
              className="flex h-4 w-full"
            />
          </HoverCardTrigger>
          <OptionHover endpoint={optionEndpoint ?? ''} type="topp" side={ESide.Left} />
        </HoverCard>

        <HoverCard openDelay={300}>
          <HoverCardTrigger className="grid w-full items-center gap-2">
            <div className="flex justify-between">
              <Label htmlFor="freq-penalty-int" className="text-left text-sm font-medium">
                {localize('com_endpoint_frequency_penalty')}{' '}
                <small className="opacity-40">
                  (
                  {localize(
                    'com_endpoint_default_with_num',
                    openAISettings.frequency_penalty.default + '',
                  )}
                  )
                </small>
              </Label>
              <InputNumber
                id="freq-penalty-int"
                disabled={readonly}
                value={freqPValue as number}
                onChange={(value) => setFreqP(Number(value))}
                max={openAISettings.frequency_penalty.max}
                min={openAISettings.frequency_penalty.min}
                step={openAISettings.frequency_penalty.step}
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
              value={[freqPValue ?? openAISettings.frequency_penalty.default]}
              onValueChange={(value) => setFreqP(value[0])}
              doubleClickHandler={() => setFreqP(openAISettings.frequency_penalty.default)}
              max={openAISettings.frequency_penalty.max}
              min={openAISettings.frequency_penalty.min}
              step={openAISettings.frequency_penalty.step}
              className="flex h-4 w-full"
            />
          </HoverCardTrigger>
          <OptionHover endpoint={optionEndpoint ?? ''} type="freq" side={ESide.Left} />
        </HoverCard>

        <HoverCard openDelay={300}>
          <HoverCardTrigger className="grid w-full items-center gap-2">
            <div className="flex justify-between">
              <Label htmlFor="pres-penalty-int" className="text-left text-sm font-medium">
                {localize('com_endpoint_presence_penalty')}{' '}
                <small className="opacity-40">
                  (
                  {localize(
                    'com_endpoint_default_with_num',
                    openAISettings.presence_penalty.default + '',
                  )}
                  )
                </small>
              </Label>
              <InputNumber
                id="pres-penalty-int"
                disabled={readonly}
                value={presPValue as number}
                onChange={(value) => setPresP(Number(value))}
                max={openAISettings.presence_penalty.max}
                min={openAISettings.presence_penalty.min}
                step={openAISettings.presence_penalty.step}
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
              value={[presPValue ?? openAISettings.presence_penalty.default]}
              onValueChange={(value) => setPresP(value[0])}
              doubleClickHandler={() => setPresP(openAISettings.presence_penalty.default)}
              max={openAISettings.presence_penalty.max}
              min={openAISettings.presence_penalty.min}
              step={openAISettings.presence_penalty.step}
              className="flex h-4 w-full"
            />
          </HoverCardTrigger>
          <OptionHover endpoint={optionEndpoint ?? ''} type="pres" side={ESide.Left} />
        </HoverCard>
        <div className="w-full">
          <div className="mb-2 flex w-full justify-between gap-2">
            <label
              htmlFor="resend-files"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 dark:text-gray-50"
            >
              <small>{localize('com_endpoint_plug_resend_files')}</small>
            </label>
            <label
              htmlFor="image-detail-value"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 dark:text-gray-50"
            >
              <small>{localize('com_endpoint_plug_image_detail')}</small>
            </label>
            <Input
              id="image-detail-value"
              disabled={true}
              value={imageDetail ?? openAISettings.imageDetail.default}
              className={cn(
                defaultTextProps,
                optionText,
                'flex rounded-md bg-transparent py-2 text-xs focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 dark:border-gray-700',
                'pointer-events-none max-h-5 w-12 border-0 group-hover/temp:border-gray-200',
              )}
            />
          </div>
          <div className="flex w-full justify-between gap-2">
            <HoverCard openDelay={500}>
              <HoverCardTrigger>
                <Switch
                  id="resend-files"
                  checked={resendFiles ?? openAISettings.resendFiles.default}
                  onCheckedChange={(checked: boolean) => setResendFiles(checked)}
                  disabled={readonly}
                  className="flex"
                />
                <OptionHover endpoint={optionEndpoint ?? ''} type="resend" side={ESide.Bottom} />
              </HoverCardTrigger>
            </HoverCard>
            <HoverCard openDelay={500}>
              <HoverCardTrigger className="flex w-[52%] md:w-[125px]">
                <Slider
                  id="image-detail-slider"
                  disabled={readonly}
                  value={[
                    imageDetailNumeric[imageDetail ?? ''] ??
                      imageDetailNumeric[openAISettings.imageDetail.default],
                  ]}
                  onValueChange={(value) => setImageDetail(imageDetailValue[value[0]])}
                  doubleClickHandler={() => setImageDetail(openAISettings.imageDetail.default)}
                  max={openAISettings.imageDetail.max}
                  min={openAISettings.imageDetail.min}
                  step={openAISettings.imageDetail.step}
                />
                <OptionHover endpoint={optionEndpoint ?? ''} type="detail" side={ESide.Bottom} />
              </HoverCardTrigger>
            </HoverCard>
          </div>
        </div>
      </div>
    </div>
  );
}
