import React from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import type { TModelSelectProps } from '~/common';
import { ESide } from '~/common';
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
import OptionHover from './OptionHover';
import { cn, defaultTextProps, optionText, removeFocusOutlines } from '~/utils/';
import { useLocalize } from '~/hooks';

export default function Settings({ conversation, setOption, models, readonly }: TModelSelectProps) {
  const localize = useLocalize();
  if (!conversation) {
    return null;
  }
  const { model, modelLabel, promptPrefix, temperature, topP, topK, maxOutputTokens, resendFiles } =
    conversation;

  const setModel = setOption('model');
  const setModelLabel = setOption('modelLabel');
  const setPromptPrefix = setOption('promptPrefix');
  const setTemperature = setOption('temperature');
  const setTopP = setOption('topP');
  const setTopK = setOption('topK');
  const setMaxOutputTokens = setOption('maxOutputTokens');
  const setResendFiles = setOption('resendFiles');

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
            <div className="flex justify-between">
              <Label htmlFor="temp-int" className="text-left text-sm font-medium">
                {localize('com_endpoint_temperature')}{' '}
                <small className="opacity-40">({localize('com_endpoint_default')}: 1)</small>
              </Label>
              <InputNumber
                id="temp-int"
                disabled={readonly}
                value={temperature}
                onChange={(value) => setTemperature(Number(value))}
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
              value={[temperature ?? 1]}
              onValueChange={(value) => setTemperature(value[0])}
              doubleClickHandler={() => setTemperature(1)}
              max={1}
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
                  ({localize('com_endpoint_default_with_num', '0.7')})
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
              value={[topP ?? 0.7]}
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
              <Label htmlFor="top-k-int" className="text-left text-sm font-medium">
                {localize('com_endpoint_top_k')}{' '}
                <small className="opacity-40">
                  ({localize('com_endpoint_default_with_num', '5')})
                </small>
              </Label>
              <InputNumber
                id="top-k-int"
                disabled={readonly}
                value={topK}
                onChange={(value) => setTopK(Number(value))}
                max={40}
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
              disabled={readonly}
              value={[topK ?? 5]}
              onValueChange={(value) => setTopK(value[0])}
              doubleClickHandler={() => setTopK(0)}
              max={40}
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
                <small className="opacity-40">
                  ({localize('com_endpoint_default_with_num', '4000')})
                </small>
              </Label>
              <InputNumber
                id="max-tokens-int"
                disabled={readonly}
                value={maxOutputTokens}
                onChange={(value) => setMaxOutputTokens(Number(value))}
                max={4000}
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
              disabled={readonly}
              value={[maxOutputTokens ?? 4000]}
              onValueChange={(value) => setMaxOutputTokens(value[0])}
              doubleClickHandler={() => setMaxOutputTokens(0)}
              max={4000}
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
