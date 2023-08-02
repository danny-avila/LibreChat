import React from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import {
  Input,
  Label,
  Slider,
  InputNumber,
  HoverCard,
  HoverCardTrigger,
  SelectDropDown,
} from '~/components/ui';
import OptionHover from './OptionHover';
import { ModelSelectProps, Side } from 'librechat-data-provider';
import { cn, defaultTextProps, optionText, removeFocusOutlines } from '~/utils/';

export default function Settings({ conversation, setOption, models, readonly }: ModelSelectProps) {
  if (!conversation) {
    return null;
  }
  const { model, modelLabel, promptPrefix, temperature, topP, topK, maxOutputTokens } =
    conversation;

  const setModel = setOption('model');
  const setModelLabel = setOption('modelLabel');
  const setPromptPrefix = setOption('promptPrefix');
  const setTemperature = setOption('temperature');
  const setTopP = setOption('topP');
  const setTopK = setOption('topK');
  const setMaxOutputTokens = setOption('maxOutputTokens');

  return (
    <div className="h-[440px] overflow-y-auto sm:h-[350px]">
      <div className="grid gap-6 sm:grid-cols-5">
        <div className="col-span-3 flex flex-col items-center justify-start gap-6">
          <div className="grid w-full items-center gap-2">
            <SelectDropDown
              value={model ?? ''}
              setValue={setModel}
              availableValues={models}
              disabled={readonly}
              className={cn(defaultTextProps, 'z-50 flex w-full resize-none', removeFocusOutlines)}
              containerClassName="flex w-full resize-none"
            />
          </div>
          <div className="grid w-full items-center gap-2">
            <Label htmlFor="modelLabel" className="text-left text-sm font-medium">
              Custom Name <small className="opacity-40">(default: blank)</small>
            </Label>
            <Input
              id="modelLabel"
              disabled={readonly}
              value={modelLabel || ''}
              onChange={(e) => setModelLabel(e.target.value ?? null)}
              placeholder="Set a custom name for Claude"
              className={cn(
                defaultTextProps,
                'flex h-10 max-h-10 w-full resize-none px-3 py-2',
                removeFocusOutlines,
              )}
            />
          </div>
          <div className="grid w-full items-center gap-2">
            <Label htmlFor="promptPrefix" className="text-left text-sm font-medium">
              Prompt Prefix <small className="opacity-40">(default: blank)</small>
            </Label>
            <TextareaAutosize
              id="promptPrefix"
              disabled={readonly}
              value={promptPrefix || ''}
              onChange={(e) => setPromptPrefix(e.target.value ?? null)}
              placeholder="Set custom instructions or context. Ignored if empty."
              className={cn(
                defaultTextProps,
                'flex max-h-[300px] min-h-[100px] w-full resize-none px-3 py-2 ',
              )}
            />
          </div>
        </div>
        <div className="col-span-2 flex flex-col items-center justify-start gap-6 px-3">
          <HoverCard openDelay={300}>
            <HoverCardTrigger className="grid w-full items-center gap-2">
              <div className="flex justify-between">
                <Label htmlFor="temp-int" className="text-left text-sm font-medium">
                  Temperature <small className="opacity-40">(default: 1)</small>
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
            <OptionHover endpoint={conversation?.endpoint ?? ''} type="temp" side={Side.Left} />
          </HoverCard>
          <HoverCard openDelay={300}>
            <HoverCardTrigger className="grid w-full items-center gap-2">
              <div className="flex justify-between">
                <Label htmlFor="top-p-int" className="text-left text-sm font-medium">
                  Top P <small className="opacity-40">(default: 0.7)</small>
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
            <OptionHover endpoint={conversation?.endpoint ?? ''} type="topp" side={Side.Left} />
          </HoverCard>

          <HoverCard openDelay={300}>
            <HoverCardTrigger className="grid w-full items-center gap-2">
              <div className="flex justify-between">
                <Label htmlFor="top-k-int" className="text-left text-sm font-medium">
                  Top K <small className="opacity-40">(default: 5)</small>
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
            <OptionHover endpoint={conversation?.endpoint ?? ''} type="topk" side={Side.Left} />
          </HoverCard>
          <HoverCard openDelay={300}>
            <HoverCardTrigger className="grid w-full items-center gap-2">
              <div className="flex justify-between">
                <Label htmlFor="max-tokens-int" className="text-left text-sm font-medium">
                  Max Output Tokens <small className="opacity-40">(default: 1024)</small>
                </Label>
                <InputNumber
                  id="max-tokens-int"
                  disabled={readonly}
                  value={maxOutputTokens}
                  onChange={(value) => setMaxOutputTokens(Number(value))}
                  max={1024}
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
                value={[maxOutputTokens ?? 1024]}
                onValueChange={(value) => setMaxOutputTokens(value[0])}
                doubleClickHandler={() => setMaxOutputTokens(0)}
                max={1024}
                min={1}
                step={1}
                className="flex h-4 w-full"
              />
            </HoverCardTrigger>
            <OptionHover
              endpoint={conversation?.endpoint ?? ''}
              type="maxoutputtokens"
              side={Side.Left}
            />
          </HoverCard>
        </div>
      </div>
    </div>
  );
}
