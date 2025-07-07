import { useCallback, useMemo, useEffect } from 'react';
import debounce from 'lodash/debounce';
import { useRecoilState } from 'recoil';
import { Constants, LocalStorageKeys } from 'librechat-data-provider';
import type { VerifyToolAuthResponse } from 'librechat-data-provider';
import type { UseQueryOptions } from '@tanstack/react-query';
import { useVerifyAgentToolAuth } from '~/data-provider';
import useLocalStorage from '~/hooks/useLocalStorageAlt';
import { ephemeralAgentByConvoId } from '~/store';

const storageCondition = (value: unknown, rawCurrentValue?: string | null) => {
  if (rawCurrentValue) {
    try {
      const currentValue = rawCurrentValue?.trim() ?? '';
      if (currentValue === 'true' && value === false) {
        return true;
      }
    } catch (e) {
      console.error(e);
    }
  }
  return value !== undefined && value !== null;
};

type ToolValue = boolean | string;

interface UseToolToggleOptions {
  conversationId?: string | null;
  toolKey: string;
  localStorageKey: LocalStorageKeys;
  isAuthenticated?: boolean;
  setIsDialogOpen?: (open: boolean) => void;
  /** Options for auth verification */
  authConfig?: {
    toolId: string;
    queryOptions?: UseQueryOptions<VerifyToolAuthResponse>;
  };
}

export function useToolToggle({
  conversationId,
  toolKey,
  localStorageKey,
  isAuthenticated: externalIsAuthenticated,
  setIsDialogOpen,
  authConfig,
}: UseToolToggleOptions) {
  const key = conversationId ?? Constants.NEW_CONVO;
  const [ephemeralAgent, setEphemeralAgent] = useRecoilState(ephemeralAgentByConvoId(key));

  const authQuery = useVerifyAgentToolAuth(
    { toolId: authConfig?.toolId || '' },
    {
      enabled: !!authConfig?.toolId,
      ...authConfig?.queryOptions,
    },
  );

  const isAuthenticated = useMemo(
    () =>
      externalIsAuthenticated ?? (authConfig ? (authQuery?.data?.authenticated ?? false) : false),
    [externalIsAuthenticated, authConfig, authQuery.data?.authenticated],
  );

  // Keep localStorage in sync
  const [, setLocalStorageValue] = useLocalStorage<ToolValue>(
    `${localStorageKey}${key}`,
    false,
    undefined,
    storageCondition,
  );

  // The actual current value comes from ephemeralAgent
  const toolValue = useMemo(() => {
    return ephemeralAgent?.[toolKey] ?? false;
  }, [ephemeralAgent, toolKey]);

  const isToolEnabled = useMemo(() => {
    // For backward compatibility, treat truthy string values as enabled
    if (typeof toolValue === 'string') {
      return toolValue.length > 0;
    }
    return toolValue === true;
  }, [toolValue]);

  // Sync to localStorage when ephemeralAgent changes
  useEffect(() => {
    const value = ephemeralAgent?.[toolKey];
    if (value !== undefined) {
      setLocalStorageValue(value);
    }
  }, [ephemeralAgent, toolKey, setLocalStorageValue]);

  const [isPinned, setIsPinned] = useLocalStorage<boolean>(`${localStorageKey}pinned`, false);

  const handleChange = useCallback(
    ({ e, value }: { e?: React.ChangeEvent<HTMLInputElement>; value: ToolValue }) => {
      if (isAuthenticated !== undefined && !isAuthenticated && setIsDialogOpen) {
        setIsDialogOpen(true);
        e?.preventDefault?.();
        return;
      }

      // Update ephemeralAgent (localStorage will sync automatically via effect)
      setEphemeralAgent((prev) => ({
        ...(prev || {}),
        [toolKey]: value,
      }));
    },
    [setIsDialogOpen, isAuthenticated, setEphemeralAgent, toolKey],
  );

  const debouncedChange = useMemo(
    () => debounce(handleChange, 50, { leading: true }),
    [handleChange],
  );

  return {
    toggleState: toolValue, // Return the actual value from ephemeralAgent
    handleChange,
    isToolEnabled,
    toolValue,
    setToggleState: (value: ToolValue) => handleChange({ value }), // Adapter for direct setting
    ephemeralAgent,
    debouncedChange,
    setEphemeralAgent,
    authData: authQuery?.data,
    isPinned,
    setIsPinned,
  };
}
