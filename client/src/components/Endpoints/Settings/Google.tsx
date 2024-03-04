import { useEffect } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { EModelEndpoint, endpointSettings } from 'librechat-data-provider';
import type { TModelSelectProps } from '~/common';
import { ESide } from '~/common';
import {
  SelectDropDown,
  Input,
  Label,
  Slider,
  InputNumber,
  HoverCard,
  HoverCardTrigger,
} from '~/components/ui';
import OptionHover from './OptionHover';
import { cn, defaultTextProps, optionText, removeFocusOutlines } from '~/utils/';
import { useLocalize } from '~/hooks';

export default function Settings({ conversation, setOption, models, readonly }: TModelSelectProps) {
  const localize = useLocalize();
  const google = endpointSettings[EModelEndpoint.google];
  const { model, modelLabel, promptPrefix, temperature, topP, topK, maxOutputTokens } =
    conversation ?? {};

  const isGeminiPro = model?.toLowerCase()?.includes('gemini-pro');

  const maxOutputTokensMax = isGeminiPro
    ? google.maxOutputTokens.maxGeminiPro
    : google.maxOutputTokens.max;
  const maxOutputTokensDefault = isGeminiPro
    ? google.maxOutputTokens.defaultGeminiPro
    : google.maxOutputTokens.default;

  useEffect(
    () => {
      if (model) {
        setOption('maxOutputTokens')(Math.min(Number(maxOutputTokens) ?? 0, maxOutputTokensMax));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model],
  );

  if (!conversation) {
    return null;
  }

  const setModel = setOption('model');
  const setModelLabel = setOption('modelLabel');
  const setPromptPrefix = setOption('promptPrefix');
  const setTemperature = setOption('temperature');
  const setTopP = setOption('topP');
  const setTopK = setOption('topK');
  const setMaxOutputTokens = setOption('maxOutputTokens');

  const isGenerativeModel = model?.toLowerCase()?.includes('gemini');
  const isChatModel = !isGenerativeModel && model?.toLowerCase()?.includes('chat');
  const isTextModel = !isGenerativeModel && !isChatModel && /code|text/.test(model ?? '');

  return (
    <div className="grid grid-cols-5 gap-6">
      <div className="col-span-5 flex flex-col items-center justify-start gap-6 sm:col-span-3">
        <div className="grid w-full items-center gap-2">
          <SelectDropDown
            value={model ?? ''}
            setValue={setModel}
            availableValues={models}
            disabled={readonly}
            className={cn(defaultTextProps, 'flex w-full resize-none', removeFocusOutlines)}
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
            placeholder={localize('com_endpoint_google_custom_name_placeholder')}
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
            <div className="flex justify-between">
              <Label htmlFor="temp-int" className="text-left text-sm font-medium">
                {localize('com_endpoint_temperature')}{' '}
                <small className="opacity-40">
                  ({localize('com_endpoint_default')}: {google.temperature.default})
                </small>
              </Label>
              <InputNumber
                id="temp-int"
                disabled={readonly}
                value={temperature}
                onChange={(value) => setTemperature(value ?? google.temperature.default)}
                max={google.temperature.max}
                min={google.temperature.min}
                step={google.temperature.step}
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
              value={[temperature ?? google.temperature.default]}
              onValueChange={(value) => setTemperature(value[0])}
              doubleClickHandler={() => setTemperature(google.temperature.default)}
              max={google.temperature.max}
              min={google.temperature.min}
              step={google.temperature.step}
              className="flex h-4 w-full"
            />
          </HoverCardTrigger>
          <OptionHover endpoint={conversation?.endpoint ?? ''} type="temp" side={ESide.Left} />
        </HoverCard>
        {!isTextModel && (
          <>
            <HoverCard openDelay={300}>
              <HoverCardTrigger className="grid w-full items-center gap-2">
                <div className="flex justify-between">
                  <Label htmlFor="top-p-int" className="text-left text-sm font-medium">
                    {localize('com_endpoint_top_p')}{' '}
                    <small className="opacity-40">
                      ({localize('com_endpoint_default_with_num', google.topP.default + '')})
                    </small>
                  </Label>
                  <InputNumber
                    id="top-p-int"
                    disabled={readonly}
                    value={topP}
                    onChange={(value) => setTopP(value ?? google.topP.default)}
                    max={google.topP.max}
                    min={google.topP.min}
                    step={google.topP.step}
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
                  value={[topP ?? google.topP.default]}
                  onValueChange={(value) => setTopP(value[0])}
                  doubleClickHandler={() => setTopP(google.topP.default)}
                  max={google.topP.max}
                  min={google.topP.min}
                  step={google.topP.step}
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
                      ({localize('com_endpoint_default_with_num', google.topK.default + '')})
                    </small>
                  </Label>
                  <InputNumber
                    id="top-k-int"
                    disabled={readonly}
                    value={topK}
                    onChange={(value) => setTopK(value ?? google.topK.default)}
                    max={google.topK.max}
                    min={google.topK.min}
                    step={google.topK.step}
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
                  value={[topK ?? google.topK.default]}
                  onValueChange={(value) => setTopK(value[0])}
                  doubleClickHandler={() => setTopK(google.topK.default)}
                  max={google.topK.max}
                  min={google.topK.min}
                  step={google.topK.step}
                  className="flex h-4 w-full"
                />
              </HoverCardTrigger>
              <OptionHover endpoint={conversation?.endpoint ?? ''} type="topk" side={ESide.Left} />
            </HoverCard>
          </>
        )}
        <HoverCard openDelay={300}>
          <HoverCardTrigger className="grid w-full items-center gap-2">
            <div className="flex justify-between">
              <Label htmlFor="max-tokens-int" className="text-left text-sm font-medium">
                {localize('com_endpoint_max_output_tokens')}{' '}
                <small className="opacity-40">
                  ({localize('com_endpoint_default_with_num', maxOutputTokensDefault + '')})
                </small>
              </Label>
              <InputNumber
                id="max-tokens-int"
                disabled={readonly}
                value={maxOutputTokens}
                onChange={(value) => setMaxOutputTokens(value ?? maxOutputTokensDefault)}
                max={maxOutputTokensMax}
                min={google.maxOutputTokens.min}
                step={google.maxOutputTokens.step}
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
              value={[maxOutputTokens ?? maxOutputTokensDefault]}
              onValueChange={(value) => setMaxOutputTokens(value[0])}
              doubleClickHandler={() => setMaxOutputTokens(maxOutputTokensDefault)}
              max={maxOutputTokensMax}
              min={google.maxOutputTokens.min}
              step={google.maxOutputTokens.step}
              className="flex h-4 w-full"
            />
          </HoverCardTrigger>
          <OptionHover
            endpoint={conversation?.endpoint ?? ''}
            type="maxoutputtokens"
            side={ESide.Left}
          />
        </HoverCard>
      </div>
    </div>
  );
}
