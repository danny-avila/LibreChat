import TextareaAutosize from 'react-textarea-autosize';
import { anthropicSettings } from 'librechat-data-provider';
import type { TModelSelectProps, OnInputNumberChange } from '~/common';
import {
  Input,
  Label,
  Slider,
  Switch,
  HoverCard,
  InputNumber,
  SelectDropDown,
  HoverCardTrigger,
} from '~/components/ui';
import { cn, defaultTextProps, optionText, removeFocusOutlines, removeFocusRings } from '~/utils';
import OptionHoverAlt from '~/components/SidePanel/Parameters/OptionHover';
import { useLocalize, useDebouncedInput } from '~/hooks';
import OptionHover from './OptionHover';
import { ESide } from '~/common';

export default function Settings({ conversation, setOption, models, readonly }: TModelSelectProps) {
  const localize = useLocalize();
  const {
    model,
    modelLabel,
    promptPrefix,
    temperature,
    topP,
    topK,
    maxOutputTokens,
    maxContextTokens,
    resendFiles,
  } = conversation ?? {};
  const [setMaxContextTokens, maxContextTokensValue] = useDebouncedInput<number | null | undefined>(
    {
      setOption,
      optionKey: 'maxContextTokens',
      initialValue: maxContextTokens,
    },
  );
  if (!conversation) {
    return null;
  }

  const setModelLabel = setOption('modelLabel');
  const setPromptPrefix = setOption('promptPrefix');
  const setTemperature = setOption('temperature');
  const setTopP = setOption('topP');
  const setTopK = setOption('topK');
  const setResendFiles = setOption('resendFiles');

  const setModel = (newModel: string) => {
    const modelSetter = setOption('model');
    const maxOutputSetter = setOption('maxOutputTokens');
    if (maxOutputTokens) {
      maxOutputSetter(anthropicSettings.maxOutputTokens.set(maxOutputTokens, newModel));
    }
    modelSetter(newModel);
  };

  const setMaxOutputTokens = (value: number) => {
    const setter = setOption('maxOutputTokens');
    if (model) {
      setter(anthropicSettings.maxOutputTokens.set(value, model));
    } else {
      setter(value);
    }
  };

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
          <Label htmlFor="modelLabel" className="text-left text-sm font-medium">
            {localize('com_endpoint_custom_name')}{' '}
            <small className="opacity-40">({localize('com_endpoint_default_blank')})</small>
          </Label>
          <Input
            id="modelLabel"
            disabled={readonly}
            value={modelLabel || ''}
            onChange={(e) => setModelLabel(e.target.value ?? null)}
            placeholder={localize('com_endpoint_anthropic_custom_name_placeholder')}
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
            value={promptPrefix || ''}
            onChange={(e) => setPromptPrefix(e.target.value ?? null)}
            placeholder={localize('com_endpoint_prompt_prefix_placeholder')}
            className={cn(
              defaultTextProps,
              'flex max-h-[138px] min-h-[100px] w-full resize-none px-3 py-2 ',
            )}
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
            <div className="flex justify-between">
              <Label htmlFor="temp-int" className="text-left text-sm font-medium">
                {localize('com_endpoint_temperature')}{' '}
                <small className="opacity-40">
                  ({localize('com_endpoint_default')}: {anthropicSettings.temperature.default})
                </small>
              </Label>
              <InputNumber
                id="temp-int"
                disabled={readonly}
                value={temperature}
                onChange={(value) => setTemperature(Number(value))}
                max={anthropicSettings.temperature.max}
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
              aria-label="Temperature Slider"
              disabled={readonly}
              value={[temperature ?? anthropicSettings.temperature.default]}
              onValueChange={(value) => setTemperature(value[0])}
              doubleClickHandler={() => setTemperature(anthropicSettings.temperature.default)}
              max={anthropicSettings.temperature.max}
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
                  ({localize('com_endpoint_default_with_num', anthropicSettings.topP.default + '')})
                </small>
              </Label>
              <InputNumber
                id="top-p-int"
                disabled={readonly}
                value={topP}
                onChange={(value) => setTopP(Number(value))}
                max={anthropicSettings.topP.max}
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
              aria-label="Top P Slider"
              disabled={readonly}
              value={[topP ?? 0.7]}
              onValueChange={(value) => setTopP(value[0])}
              doubleClickHandler={() => setTopP(anthropicSettings.topP.default)}
              max={anthropicSettings.topP.max}
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
              <Label htmlFor="top-k-int" className="text-left text-sm font-medium">
                {localize('com_endpoint_top_k')}{' '}
                <small className="opacity-40">
                  ({localize('com_endpoint_default_with_num', anthropicSettings.topK.default + '')})
                </small>
              </Label>
              <InputNumber
                id="top-k-int"
                disabled={readonly}
                value={topK}
                onChange={(value) => setTopK(Number(value))}
                max={anthropicSettings.topK.max}
                min={1}
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
              aria-label="Top K Slider"
              disabled={readonly}
              value={[topK ?? 5]}
              onValueChange={(value) => setTopK(value[0])}
              doubleClickHandler={() => setTopK(anthropicSettings.topK.default)}
              max={anthropicSettings.topK.max}
              min={1}
              step={0.01}
              className="flex h-4 w-full"
            />
          </HoverCardTrigger>
          <OptionHover endpoint={conversation?.endpoint ?? ''} type="topk" side={ESide.Left} />
        </HoverCard>
        <HoverCard openDelay={300}>
          <HoverCardTrigger className="grid w-full items-center gap-2">
            <div className="flex justify-between">
              <Label htmlFor="max-tokens-int" className="text-left text-sm font-medium">
                {localize('com_endpoint_max_output_tokens')}{' '}
                <small className="opacity-40">({anthropicSettings.maxOutputTokens.default})</small>
              </Label>
              <InputNumber
                id="max-tokens-int"
                disabled={readonly}
                value={maxOutputTokens}
                onChange={(value) => setMaxOutputTokens(Number(value))}
                max={anthropicSettings.maxOutputTokens.max}
                min={1}
                step={1}
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
              aria-label="Max Tokens Slider"
              disabled={readonly}
              value={[maxOutputTokens ?? anthropicSettings.maxOutputTokens.default]}
              onValueChange={(value) => setMaxOutputTokens(value[0])}
              doubleClickHandler={() =>
                setMaxOutputTokens(anthropicSettings.maxOutputTokens.default)
              }
              max={anthropicSettings.maxOutputTokens.max}
              min={1}
              step={1}
              className="flex h-4 w-full"
            />
          </HoverCardTrigger>
          <OptionHover
            endpoint={conversation?.endpoint ?? ''}
            type="maxoutputtokens"
            side={ESide.Left}
          />
        </HoverCard>
        <HoverCard openDelay={500}>
          <HoverCardTrigger className="grid w-full">
            <div className="flex justify-between">
              <Label htmlFor="resend-files" className="text-left text-sm font-medium">
                {localize('com_endpoint_plug_resend_files')}{' '}
              </Label>
              <Switch
                id="resend-files"
                checked={resendFiles ?? true}
                onCheckedChange={(checked: boolean) => setResendFiles(checked)}
                disabled={readonly}
                className="flex"
              />
              <OptionHover
                endpoint={conversation?.endpoint ?? ''}
                type="resend"
                side={ESide.Bottom}
              />
            </div>
          </HoverCardTrigger>
        </HoverCard>
      </div>
    </div>
  );
}
