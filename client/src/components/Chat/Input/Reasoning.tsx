import { useEffect, useId, useMemo, useRef, useState } from 'react';
import keyBy from 'lodash/keyBy';
import { useRecoilState } from 'recoil';
import * as Popover from '@radix-ui/react-popover';
import { BrainCircuit, ChevronDown, X } from 'lucide-react';
import { Button, Input, Slider } from '@librechat/client';
import {
  Constants,
  ReasoningParameterFormat,
  agentParamSettings,
  applyModelAwareDefaults,
  clampSettingRange,
  getEndpointField,
  getSettingsKeys,
  isAgentsEndpoint,
  isAssistantsEndpoint,
  paramSettings,
  reasoningOverrideSchema,
  resolveReasoningSetting,
} from 'librechat-data-provider';
import type {
  Agent,
  SettingDefinition,
  TConversation,
  TReasoningOverride,
} from 'librechat-data-provider';
import { useGetAgentByIdQuery, useGetEndpointsQuery } from '~/data-provider';
import { useLocalize, TranslationKeys } from '~/hooks';
import { useAgentsMapContext } from '~/Providers';
import { formatTokens } from '~/utils';
import store from '~/store';

type ReasoningControlProps = {
  setting: SettingDefinition;
  value?: TReasoningOverride;
  disabled?: boolean;
  onChange: (value: TReasoningOverride) => void;
};

const translated = (
  value: string | number | boolean | undefined,
  localize: ReturnType<typeof useLocalize>,
) =>
  typeof value === 'string' && value.startsWith('com_')
    ? localize(value as TranslationKeys)
    : String(value ?? '');

export function ReasoningControl({
  setting,
  value,
  disabled = false,
  onChange,
}: ReasoningControlProps) {
  const localize = useLocalize();
  const labelId = useId();
  const options = setting.options ?? [];
  const isEnum = setting.type === 'enum' && options.length > 0;
  const label = translated(setting.label ?? setting.key, localize);
  const selectedValue = value?.key === setting.key ? value.value : setting.default;
  const selectedIndex = isEnum ? Math.max(0, options.indexOf(String(selectedValue ?? ''))) : 0;
  let displayValue = String(selectedValue ?? localize('com_ui_auto'));
  if (isEnum) {
    displayValue = translated(
      setting.enumMappings?.[options[selectedIndex]] ?? options[selectedIndex],
      localize,
    );
  } else if (selectedValue === -1) {
    displayValue = localize('com_ui_auto');
  } else if (typeof selectedValue === 'number') {
    displayValue = `${formatTokens(selectedValue)} ${localize('com_ui_tokens')}`;
  }
  const [numericValue, setNumericValue] = useState(String(selectedValue ?? -1));

  useEffect(() => {
    if (!isEnum) {
      setNumericValue(String(selectedValue ?? -1));
    }
  }, [isEnum, selectedValue]);

  const emit = (nextValue: string | number) => {
    const parsed = reasoningOverrideSchema.safeParse({ key: setting.key, value: nextValue });
    if (parsed.success) {
      onChange(parsed.data);
    }
  };

  const range = useMemo(() => setting.range ?? { min: -1, max: 200000, step: 1 }, [setting.range]);
  const numericMin = range.positiveMin ?? Math.max(0, range.min);
  const parsedNumericValue = Number(numericValue);
  const numericScaleValue = Number.isFinite(parsedNumericValue)
    ? Math.min(range.max, Math.max(numericMin, parsedNumericValue))
    : numericMin;
  const isAuto = range.min === -1 && numericValue === '-1';

  const emitNumericValue = (nextValue: number) => {
    setNumericValue(String(nextValue));
    emit(nextValue);
  };

  const commitNumericValue = () => {
    const parsed = Number(numericValue);
    const nextValue = clampSettingRange(
      Number.isFinite(parsed) ? Math.round(parsed) : range.min,
      range,
    );
    setNumericValue(String(nextValue));
    emit(nextValue);
  };

  return (
    <Popover.Root modal>
      <Popover.Trigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          aria-label={`${localize('com_ui_reasoning_for_next_message')} ${displayValue}`}
          className="h-8 gap-1.5 rounded-xl px-2 text-text-secondary data-[state=open]:bg-surface-hover data-[state=open]:text-text-primary"
        >
          <BrainCircuit className="size-4" aria-hidden="true" />
          <span className="@sm:inline hidden max-w-24 truncate">{displayValue}</span>
          <ChevronDown className="size-3" aria-hidden="true" />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          role="dialog"
          aria-label={label}
          align="end"
          sideOffset={6}
          className="z-50 w-72 max-w-[calc(100vw-2rem)] origin-[--radix-popover-content-transform-origin] overflow-hidden rounded-2xl border border-border-light bg-surface-secondary text-text-primary shadow-xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 motion-reduce:animate-none"
        >
          <div className="flex items-center gap-2 px-4 py-3">
            <BrainCircuit className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div id={labelId} className="truncate text-sm font-medium">
                {label}
              </div>
              <div className="truncate text-xs text-text-secondary">
                {localize('com_ui_reasoning_for_next_message')}
              </div>
            </div>
            <Popover.Close asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={localize('com_ui_close')}
                className="-mr-1 shrink-0 rounded-lg text-text-secondary"
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </Popover.Close>
          </div>
          <div className="border-t border-border-light px-4 pb-4 pt-3">
            {isEnum ? (
              <>
                <div className="mb-4 text-sm font-medium text-text-primary">{displayValue}</div>
                <Slider
                  aria-labelledby={labelId}
                  aria-valuetext={displayValue}
                  value={[selectedIndex]}
                  min={0}
                  max={options.length - 1}
                  step={1}
                  onValueChange={([nextIndex]) => emit(options[nextIndex])}
                  className="py-1"
                />
                <div className="mt-2.5 flex justify-between gap-4 text-xs text-text-secondary">
                  <span className="truncate">
                    {translated(setting.enumMappings?.[options[0]] ?? options[0], localize)}
                  </span>
                  <span className="truncate text-right">
                    {translated(
                      setting.enumMappings?.[options[options.length - 1]] ??
                        options[options.length - 1],
                      localize,
                    )}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <Input
                      type="number"
                      aria-label={label}
                      value={numericValue === '-1' ? '' : numericValue}
                      placeholder={formatTokens(numericMin)}
                      min={numericMin}
                      max={range.max}
                      step={range.step ?? 1}
                      onChange={(event) => setNumericValue(event.target.value)}
                      onBlur={commitNumericValue}
                      className="h-8 w-24 bg-surface-primary px-2 text-right font-medium shadow-sm"
                    />
                    <span className="truncate text-xs text-text-secondary">
                      {localize('com_ui_tokens')}
                    </span>
                  </div>
                  {range.min === -1 && (
                    <Button
                      type="button"
                      variant={isAuto ? 'default' : 'ghost'}
                      size="sm"
                      aria-pressed={isAuto}
                      onClick={() => emitNumericValue(-1)}
                      className="h-8 shrink-0 px-2.5 text-xs"
                    >
                      {localize('com_ui_auto')}
                    </Button>
                  )}
                </div>
                <Slider
                  aria-labelledby={labelId}
                  aria-valuetext={
                    isAuto
                      ? localize('com_ui_auto')
                      : `${formatTokens(numericScaleValue)} ${localize('com_ui_tokens')}`
                  }
                  value={[numericScaleValue]}
                  min={numericMin}
                  max={range.max}
                  step={range.step ?? 1}
                  onValueChange={([nextValue]) => emitNumericValue(nextValue)}
                  className="py-1"
                />
                <div className="mt-2.5 flex justify-between gap-4 text-xs text-text-secondary">
                  <span>{formatTokens(numericMin)}</span>
                  <span>{formatTokens(range.max)}</span>
                </div>
              </>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

type ComposerReasoningProps = {
  conversation: TConversation | null;
  index: number;
  disabled?: boolean;
  hasAddedConversation?: boolean;
};

export function ComposerReasoning({
  conversation,
  index,
  disabled = false,
  hasAddedConversation = false,
}: ComposerReasoningProps) {
  const agentsMap = useAgentsMapContext();
  const { data: fetchedAgent } = useGetAgentByIdQuery(conversation?.agent_id);
  const { data: endpointsConfig = {} } = useGetEndpointsQuery();
  const conversationId = conversation?.conversationId ?? Constants.NEW_CONVO;
  const [value, setValue] = useRecoilState(store.pendingReasoningOverrideByConvoId(conversationId));
  const endpoint = conversation?.endpointType ?? conversation?.endpoint ?? '';
  const agent = (fetchedAgent ?? agentsMap?.[conversation?.agent_id ?? '']) as Agent | undefined;
  const isAgent = isAgentsEndpoint(endpoint);
  const provider = isAgent ? (agent?.provider ?? '') : (conversation?.endpoint ?? '');
  const model = isAgent ? (agent?.model ?? '') : (conversation?.model ?? '');
  const endpointType = getEndpointField(endpointsConfig, provider, 'type');

  const settings = useMemo(() => {
    const customParams = endpointsConfig[provider]?.customParams ?? {};
    const [combinedKey, endpointKey] = getSettingsKeys(endpointType ?? provider, model);
    const defaultEndpoint = customParams.defaultParamsEndpoint ?? endpointKey;
    const baseSettings = isAgent
      ? (agentParamSettings[combinedKey] ?? agentParamSettings[defaultEndpoint] ?? [])
      : (paramSettings[combinedKey] ?? paramSettings[defaultEndpoint] ?? []);
    const overrides = keyBy(customParams.paramDefinitions ?? [], 'key');
    return applyModelAwareDefaults(baseSettings, defaultEndpoint, model).map(
      (setting) => (overrides[setting.key] as SettingDefinition | undefined) ?? setting,
    );
  }, [endpointType, endpointsConfig, isAgent, model, provider]);

  const setting = useMemo(
    () => resolveReasoningSetting({ endpoint: endpointType ?? provider, model, settings }),
    [endpointType, model, provider, settings],
  );
  const targetFingerprint = `${isAgent ? conversation?.agent_id : provider}:${model}:${setting?.key ?? ''}`;
  const previousTarget = useRef(targetFingerprint);

  useEffect(() => {
    if (previousTarget.current !== targetFingerprint) {
      previousTarget.current = targetFingerprint;
      setValue(undefined);
      return;
    }
    if (value != null && value.key !== setting?.key) {
      setValue(undefined);
    }
  }, [setValue, setting?.key, targetFingerprint, value]);

  if (
    index !== 0 ||
    hasAddedConversation ||
    isAssistantsEndpoint(endpoint) ||
    (isAgent && agent == null) ||
    endpointsConfig[provider]?.customParams?.reasoningFormat ===
      ReasoningParameterFormat.disabled ||
    setting == null
  ) {
    return null;
  }

  const configuredValue = isAgent
    ? agent?.model_parameters?.[setting.key]
    : conversation?.[setting.key];
  const displayedValue =
    value ??
    reasoningOverrideSchema.safeParse({
      key: setting.key,
      value: configuredValue ?? setting.default,
    }).data;

  return (
    <ReasoningControl
      setting={setting}
      value={displayedValue}
      disabled={disabled}
      onChange={setValue}
    />
  );
}
