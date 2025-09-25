import { useState, useCallback, useMemo, useEffect } from 'react';
import { useRecoilState } from 'recoil';
import {
  Input,
  Label,
  Button,
  Switch,
  SelectDropDown,
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from '@librechat/client';
import { Info, Plus, X, ChevronUp, ChevronDown } from 'lucide-react';
import OpenRouterCredits from '~/components/Nav/OpenRouterCredits';
import CreditsErrorBoundary from '~/components/Nav/CreditsErrorBoundary';
import { openRouterZDREnabledState } from '~/store/openrouter';
import type { TModelSelectProps } from '~/common';
import { cn, defaultTextProps, removeFocusOutlines, removeFocusRings } from '~/utils';
import { useLocalize } from '~/hooks';

export default function OpenRouterSettings({
  conversation,
  setOption,
  models,
  readonly,
}: TModelSelectProps) {
  const localize = useLocalize();
  const [globalZDREnabled, setGlobalZDREnabled] = useRecoilState(openRouterZDREnabledState);

  const [selectedModel, setSelectedModel] = useState('');
  const setModel = setOption('model');
  const setModelLabel = setOption('modelLabel');
  const setModelOptions = setOption('modelOptions');

  const modelOptions = useMemo(
    () => conversation?.modelOptions ?? {},
    [conversation?.modelOptions],
  );
  const fallbackChain = useMemo(() => {
    return Array.isArray(modelOptions.fallbackModels) ? [...modelOptions.fallbackModels] : [];
  }, [modelOptions]);
  const autoRouter = Boolean(modelOptions.autoRouter);
  const providerPreferences = (modelOptions.providerPreferences as string) ?? 'balanced';

  // Fallback chain handlers
  const addToFallbackChain = useCallback(() => {
    if (!selectedModel || fallbackChain.includes(selectedModel) || fallbackChain.length >= 5) {
      return;
    }
    setModelOptions({
      ...modelOptions,
      fallbackModels: [...fallbackChain, selectedModel],
    });
    setSelectedModel('');
  }, [selectedModel, fallbackChain, modelOptions, setModelOptions]);

  const removeFromFallbackChain = useCallback(
    (index: number) => {
      setModelOptions({
        ...modelOptions,
        fallbackModels: fallbackChain.filter((_, i) => i !== index),
      });
    },
    [fallbackChain, modelOptions, setModelOptions],
  );

  const moveInChain = useCallback(
    (index: number, direction: 'up' | 'down') => {
      const newIndex = direction === 'up' ? index - 1 : index + 1;

      if (newIndex < 0 || newIndex >= fallbackChain.length) {
        return;
      }

      const updatedChain = [...fallbackChain];
      [updatedChain[index], updatedChain[newIndex]] = [updatedChain[newIndex], updatedChain[index]];

      setModelOptions({
        ...modelOptions,
        fallbackModels: updatedChain,
      });
    },
    [fallbackChain, modelOptions, setModelOptions],
  );

  const handleAutoRouterChange = useCallback(
    (checked: boolean) => {
      console.log('[OpenRouter Settings] Auto-router toggle changed:', checked);
      const newModelOptions = {
        ...modelOptions,
        autoRouter: checked,
      };
      if (checked) {
        // Clear fallback chain when Auto Router is enabled
        newModelOptions.fallbackModels = [];
      }
      console.log('[OpenRouter Settings] Setting modelOptions:', newModelOptions);
      setModelOptions(newModelOptions);

      // CRITICAL: Also set at root level for schema compatibility
      if (setOption && setOption('autoRouter')) {
        setOption('autoRouter')(checked);
      }
    },
    [modelOptions, setModelOptions, setOption],
  );

  const handleProviderPreferencesChange = useCallback(
    (value: string) => {
      setModelOptions({
        ...modelOptions,
        providerPreferences: value,
      });
    },
    [modelOptions, setModelOptions],
  );

  const handleZDRChange = useCallback(
    (checked: boolean) => {
      console.log('[OpenRouter Settings] ZDR toggle changed:', checked);
      // Update global state
      setGlobalZDREnabled(checked);

      // Update conversation model options
      setModelOptions({
        ...modelOptions,
        zdr: checked,
      });
      // Also set at root level for schema compatibility
      if (setOption && setOption('zdr')) {
        setOption('zdr')(checked);
      }
    },
    [modelOptions, setModelOptions, setOption, setGlobalZDREnabled],
  );

  // Sync ZDR state on mount and when global state changes
  useEffect(() => {
    if (globalZDREnabled !== Boolean(modelOptions.zdr)) {
      // Global state has changed, update conversation
      setModelOptions({
        ...modelOptions,
        zdr: globalZDREnabled,
      });
    }
  }, [globalZDREnabled]); // Deliberately omitting modelOptions to avoid loop

  if (!conversation) {
    return null;
  }

  return (
    <div className="grid grid-cols-5 gap-6">
      <div className="col-span-5 flex flex-col items-center justify-start gap-6 sm:col-span-3">
        {/* Primary Model Selection */}
        <div className="grid w-full items-center gap-2">
          <div className="flex items-center justify-between">
            <Label className="text-left text-sm font-medium">
              {localize('com_ui_model')}
              {autoRouter && (
                <span className="ml-2 rounded bg-green-100 px-2 py-1 text-xs text-green-700 dark:bg-green-900 dark:text-green-300">
                  {localize('com_endpoint_openrouter_auto_router_active')}
                </span>
              )}
            </Label>
          </div>
          <SelectDropDown
            title={localize('com_ui_model')}
            value={conversation.model ?? ''}
            setValue={setModel}
            availableValues={models}
            disabled={readonly}
            className={cn(defaultTextProps, 'flex w-full resize-none', removeFocusRings)}
            containerClassName="flex w-full resize-none"
          />
          {autoRouter && (
            <p className="text-xs text-muted-foreground">
              {localize('com_endpoint_openrouter_auto_router_model_hint')}
            </p>
          )}
        </div>

        {/* Model Label */}
        <div className="grid w-full items-center gap-2">
          <Label htmlFor="modelLabel" className="text-left text-sm font-medium">
            {localize('com_endpoint_custom_name')}{' '}
            <small className="opacity-40">({localize('com_endpoint_default_blank')})</small>
          </Label>
          <Input
            id="modelLabel"
            disabled={readonly}
            value={conversation.modelLabel || ''}
            onChange={(e) => setModelLabel(e.target.value ?? null)}
            placeholder={localize('com_endpoint_custom_name_placeholder')}
            className={cn(
              defaultTextProps,
              'flex h-10 max-h-10 w-full resize-none px-3 py-2',
              removeFocusOutlines,
            )}
          />
        </div>

        {/* Auto Router Toggle */}
        <div className="grid w-full items-center gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label htmlFor="autoRouter" className="text-left text-sm font-medium">
                {localize('com_endpoint_openrouter_auto_router_label')}
              </Label>
              <HoverCard openDelay={300}>
                <HoverCardTrigger>
                  <Info className="h-4 w-4 text-gray-500" />
                </HoverCardTrigger>
                <HoverCardContent className="w-80">
                  <p className="text-sm">{localize('com_endpoint_openrouter_auto_router_help')}</p>
                </HoverCardContent>
              </HoverCard>
            </div>
            <Switch
              id="autoRouter"
              checked={autoRouter}
              onCheckedChange={handleAutoRouterChange}
              disabled={readonly}
            />
          </div>
        </div>

        {/* Fallback Chain Builder - Only show if Auto Router is disabled */}
        {!autoRouter && (
          <div className="grid w-full items-center gap-2">
            <div className="flex items-center gap-2">
              <Label className="text-left text-sm font-medium">
                {localize('com_endpoint_openrouter_fallback_label')}
              </Label>
              <HoverCard openDelay={300}>
                <HoverCardTrigger>
                  <Info className="h-4 w-4 text-gray-500" />
                </HoverCardTrigger>
                <HoverCardContent className="w-80">
                  <p className="text-sm">{localize('com_endpoint_openrouter_fallback_help')}</p>
                </HoverCardContent>
              </HoverCard>
            </div>

            {/* Model selector and add button */}
            <div className="flex gap-2">
              <SelectDropDown
                title={localize('com_endpoint_openrouter_fallback_select')}
                value={selectedModel}
                setValue={setSelectedModel}
                availableValues={models.filter((m) => !fallbackChain.includes(m))}
                disabled={readonly || fallbackChain.length >= 5}
                className={cn(defaultTextProps, 'flex flex-1 resize-none', removeFocusRings)}
                containerClassName="flex flex-1 resize-none"
              />
              <Button
                onClick={addToFallbackChain}
                disabled={!selectedModel || readonly || fallbackChain.length >= 5}
                className="px-3"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Fallback chain list */}
            {fallbackChain.length > 0 && (
              <div className="space-y-2 rounded-lg border p-3">
                {fallbackChain.map((model, index) => (
                  <div
                    key={`${model}-${index}`}
                    className="flex items-center justify-between gap-2 rounded border bg-surface-tertiary p-2"
                  >
                    <span className="text-sm">
                      {index + 1}. {model}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => moveInChain(index, 'up')}
                        disabled={index === 0 || readonly}
                        className="h-7 w-7 p-0"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => moveInChain(index, 'down')}
                        disabled={index === fallbackChain.length - 1 || readonly}
                        className="h-7 w-7 p-0"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeFromFallbackChain(index)}
                        disabled={readonly}
                        className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Zero Data Retention (ZDR) Toggle */}
        <div className="grid w-full items-center gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label htmlFor="zdr" className="text-left text-sm font-medium">
                {localize('com_endpoint_openrouter_zdr_label')}
              </Label>
              <HoverCard openDelay={300}>
                <HoverCardTrigger>
                  <Info className="h-4 w-4 text-gray-500" />
                </HoverCardTrigger>
                <HoverCardContent className="w-80">
                  <p className="text-sm">{localize('com_endpoint_openrouter_zdr_help')}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {localize('com_endpoint_openrouter_zdr_note')}
                  </p>
                </HoverCardContent>
              </HoverCard>
            </div>
            <Switch
              id="zdr"
              checked={globalZDREnabled}
              onCheckedChange={handleZDRChange}
              disabled={readonly}
            />
          </div>
          {globalZDREnabled && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {localize('com_endpoint_openrouter_zdr_active')}
            </p>
          )}
        </div>

        {/* Provider Preferences */}
        <div className="grid w-full items-center gap-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="providerPreferences" className="text-left text-sm font-medium">
              {localize('com_endpoint_openrouter_provider_label')}
            </Label>
            <HoverCard openDelay={300}>
              <HoverCardTrigger>
                <Info className="h-4 w-4 text-gray-500" />
              </HoverCardTrigger>
              <HoverCardContent className="w-80">
                <p className="text-sm">{localize('com_endpoint_openrouter_provider_help')}</p>
              </HoverCardContent>
            </HoverCard>
          </div>
          <SelectDropDown
            title={localize('com_endpoint_openrouter_provider_title')}
            value={providerPreferences}
            setValue={handleProviderPreferencesChange}
            availableValues={[
              { value: 'balanced', label: localize('com_endpoint_openrouter_provider_balanced') },
              { value: 'cheapest', label: localize('com_endpoint_openrouter_provider_cheapest') },
              { value: 'fastest', label: localize('com_endpoint_openrouter_provider_fastest') },
            ]}
            disabled={readonly}
            className={cn(defaultTextProps, 'flex w-full resize-none', removeFocusRings)}
            containerClassName="flex w-full resize-none"
          />
        </div>
      </div>

      {/* Right column - Credits display */}
      <div className="col-span-5 flex flex-col items-center justify-start gap-6 sm:col-span-2">
        <CreditsErrorBoundary>
          <OpenRouterCredits className="w-full" />
        </CreditsErrorBoundary>
      </div>
    </div>
  );
}
