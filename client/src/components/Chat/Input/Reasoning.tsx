import { useCallback, useMemo, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { Check, ChevronDown } from 'lucide-react';
import { DropdownPopup, TooltipAnchor } from '@librechat/client';
import {
  getDefaultParamsEndpoint,
  getEndpointField,
  getModelSpecReasoningValue,
  resolveModelSpecReasoning,
} from 'librechat-data-provider';
import type { TConversation, TModelSpec } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import type { MenuItemProps } from '~/common';
import { useLocalize, useSetIndexOptions } from '~/hooks';
import { useGetEndpointsQuery } from '~/data-provider';
import { cn } from '~/utils';

function Reasoning({
  index,
  disabled,
  modelSpec,
  conversation,
}: {
  index: number;
  disabled: boolean;
  modelSpec?: TModelSpec;
  conversation: TConversation | null;
}) {
  const localize = useLocalize();
  const { setOption } = useSetIndexOptions();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const [isOpen, setIsOpen] = useState(false);

  const setting = useMemo(() => {
    const endpoint = conversation?.endpoint ?? modelSpec?.preset.endpoint;
    const endpointType =
      conversation?.endpointType ?? getEndpointField(endpointsConfig, endpoint, 'type');
    return resolveModelSpecReasoning({
      modelSpec,
      endpoint,
      endpointType,
      defaultParamsEndpoint: getDefaultParamsEndpoint(endpointsConfig, endpoint),
      paramDefinitions: endpointsConfig?.[endpoint ?? '']?.customParams?.paramDefinitions,
    });
  }, [conversation?.endpoint, conversation?.endpointType, endpointsConfig, modelSpec]);

  const getLabel = useCallback(
    (value: string | number) => {
      const mappedValue = setting?.enumMappings?.[String(value)];
      if (typeof mappedValue === 'string' && mappedValue.startsWith('com_')) {
        return localize(mappedValue as TranslationKeys);
      }
      if (mappedValue != null) {
        return String(mappedValue);
      }
      if (value === '') {
        return localize('com_ui_auto');
      }
      return typeof value === 'number' ? value.toLocaleString() : value;
    },
    [localize, setting?.enumMappings],
  );

  const selectedValue = useMemo(
    () => (setting ? getModelSpecReasoningValue(setting, conversation) : undefined),
    [conversation, setting],
  );
  const selectedLabel = selectedValue == null ? '' : getLabel(selectedValue);

  const items = useMemo<MenuItemProps[]>(
    () =>
      setting?.options.map((option, optionIndex) => {
        const isSelected = Object.is(option, selectedValue);
        return {
          id: `reasoning-option-${index}-${optionIndex}`,
          label: getLabel(option),
          ariaChecked: isSelected,
          icon: isSelected ? (
            <Check className="size-4" aria-hidden="true" />
          ) : (
            <span className="size-4" />
          ),
          onClick: () => setOption(setting.key)(option),
        };
      }) ?? [],
    [getLabel, index, selectedValue, setOption, setting],
  );

  if (!setting) {
    return null;
  }

  const thinkingLabel = localize('com_endpoint_thinking');
  const ariaLabel = `${thinkingLabel}: ${selectedLabel}`;
  const trigger = (
    <TooltipAnchor
      description={ariaLabel}
      disabled={disabled}
      render={
        <Ariakit.MenuButton
          id={`reasoning-dropdown-button-${index}`}
          aria-label={ariaLabel}
          disabled={disabled}
          data-testid="reasoning-dropdown-button"
          className={cn(
            'flex h-9 items-center justify-center gap-1.5 rounded-full px-2.5 text-text-secondary transition-colors hover:bg-surface-hover',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-opacity-50',
            'disabled:cursor-not-allowed disabled:opacity-50',
            isOpen && 'bg-surface-hover',
          )}
        >
          <span className="text-sm font-medium text-text-primary">{selectedLabel}</span>
          <ChevronDown className="size-3.5" aria-hidden="true" />
        </Ariakit.MenuButton>
      }
    />
  );

  return (
    <DropdownPopup
      menuId={`reasoning-dropdown-menu-${index}`}
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      trigger={trigger}
      items={items}
      itemClassName="min-w-36"
      iconClassName="mr-0"
      portal={true}
      unmountOnHide={true}
    />
  );
}

export default Reasoning;
