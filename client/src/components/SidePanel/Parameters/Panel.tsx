import React, { useMemo, useEffect, useCallback, useState } from 'react';
import keyBy from 'lodash/keyBy';
import { Button } from '@librechat/client';
import { RotateCcw, BookPlus } from 'lucide-react';
import {
  excludedKeys,
  paramSettings,
  getSettingsKeys,
  getEndpointField,
  SettingDefinition,
  tConvoUpdateSchema,
} from 'librechat-data-provider';
import type { TPreset } from 'librechat-data-provider';
import { useSetIndexOptions, useLocalize } from '~/hooks';
import { useGetEndpointsQuery } from '~/data-provider';
import SaveAsPresetDialog from './SaveAsPresetDialog';
import { componentMapping } from './components';
import { useChatContext } from '~/Providers';
import { logger } from '~/utils';

export default function Parameters() {
  const localize = useLocalize();
  const { conversation, setConversation } = useChatContext();
  const { setOption } = useSetIndexOptions();

  const { data: endpointsConfig = {} } = useGetEndpointsQuery();
  const provider = conversation?.endpoint ?? '';
  const model = conversation?.model ?? '';

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [preset, setPreset] = useState<TPreset | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const bedrockRegions = useMemo(() => {
    return endpointsConfig?.[conversation?.endpoint ?? '']?.availableRegions ?? [];
  }, [endpointsConfig, conversation?.endpoint]);

  const endpointType = useMemo(
    () => getEndpointField(endpointsConfig, conversation?.endpoint, 'type'),
    [conversation?.endpoint, endpointsConfig],
  );

  const parameters = useMemo((): SettingDefinition[] => {
    const customParams = endpointsConfig[provider]?.customParams ?? {};
    const [combinedKey, endpointKey] = getSettingsKeys(endpointType ?? provider, model);
    const overriddenEndpointKey = customParams.defaultParamsEndpoint ?? endpointKey;
    const defaultParams = paramSettings[combinedKey] ?? paramSettings[overriddenEndpointKey] ?? [];
    const overriddenParams = endpointsConfig[provider]?.customParams?.paramDefinitions ?? [];
    const overriddenParamsMap = keyBy(overriddenParams, 'key');
    return defaultParams
      .filter((param) => param != null)
      .map((param) => (overriddenParamsMap[param.key] as SettingDefinition) ?? param);
  }, [endpointType, endpointsConfig, model, provider]);

  useEffect(() => {
    if (!parameters) {
      return;
    }

    // const defaultValueMap = new Map();
    // const paramKeys = new Set(
    //   parameters.map((setting) => {
    //     if (setting.default != null) {
    //       defaultValueMap.set(setting.key, setting.default);
    //     }
    //     return setting.key;
    //   }),
    // );
    const paramKeys = new Set(
      parameters.filter((setting) => setting != null).map((setting) => setting.key),
    );
    setConversation((prev) => {
      if (!prev) {
        return prev;
      }

      const updatedConversation = { ...prev };

      const conversationKeys = Object.keys(updatedConversation);
      const updatedKeys: string[] = [];
      conversationKeys.forEach((key) => {
        // const defaultValue = defaultValueMap.get(key);
        // if (paramKeys.has(key) && defaultValue != null && prev[key] != null) {
        //   updatedKeys.push(key);
        //   updatedConversation[key] = defaultValue;
        //   return;
        // }

        if (paramKeys.has(key)) {
          return;
        }

        if (excludedKeys.has(key)) {
          return;
        }

        if (prev[key] != null) {
          updatedKeys.push(key);
          delete updatedConversation[key];
        }
      });

      logger.log('parameters', 'parameters effect, updated keys:', updatedKeys);

      return updatedConversation;
    });
  }, [parameters, setConversation]);

  const resetParameters = useCallback(() => {
    if (isResetting) {
      return;
    }

    setIsResetting(true);
    setTimeout(() => setIsResetting(false), 500);

    setConversation((prev) => {
      if (!prev) {
        return prev;
      }

      const updatedConversation = { ...prev };
      const resetKeys: string[] = [];

      Object.keys(updatedConversation).forEach((key) => {
        if (excludedKeys.has(key)) {
          return;
        }

        if (updatedConversation[key] !== undefined) {
          resetKeys.push(key);
          delete updatedConversation[key];
        }
      });

      logger.log('parameters', 'parameters reset, affected keys:', resetKeys);
      return updatedConversation;
    });
  }, [isResetting, setConversation]);

  const saveAsPreset = useCallback(() => {
    const newPreset = tConvoUpdateSchema.parse({
      ...conversation,
    }) as TPreset;
    setPreset(newPreset);
    setIsDialogOpen(true);
  }, [conversation]);

  if (!parameters) {
    return null;
  }

  return (
    <div className="h-auto max-w-full overflow-x-hidden p-3">
      <div className="grid grid-cols-2 gap-4">
        {' '}
        {/* This is the parent element containing all settings */}
        {/* Below is an example of an applied dynamic setting, each be contained by a div with the column span specified */}
        {parameters.map((setting) => {
          const Component = componentMapping[setting.component];
          if (!Component) {
            return null;
          }
          const { key, default: defaultValue, ...rest } = setting;

          if (key === 'region' && bedrockRegions.length) {
            rest.options = bedrockRegions;
          }

          return (
            <Component
              key={key}
              settingKey={key}
              defaultValue={defaultValue}
              {...rest}
              setOption={setOption}
              conversation={conversation}
            />
          );
        })}
      </div>
      <div className="mt-4 flex justify-center">
        <Button
          className="w-full"
          variant="outline"
          onClick={resetParameters}
          disabled={isResetting}
        >
          <RotateCcw
            className={`h-4 w-4 ${isResetting ? 'animate-spin-reset' : ''}`}
            aria-hidden="true"
          />
          {localize('com_ui_reset_var', { 0: localize('com_ui_model_parameters') })}
        </Button>
      </div>
      <div className="mt-2 flex justify-center">
        <Button className="w-full" variant="default" onClick={saveAsPreset} type="button">
          <BookPlus className="h-4 w-4" aria-hidden="true" />
          {localize('com_endpoint_save_as_preset')}
        </Button>
      </div>
      {preset && (
        <SaveAsPresetDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} preset={preset} />
      )}
    </div>
  );
}
