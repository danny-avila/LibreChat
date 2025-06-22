import { useRef, useEffect, useCallback, useMemo } from 'react';
import { useRecoilState } from 'recoil';
import debounce from 'lodash/debounce';
import { Constants, LocalStorageKeys } from 'librechat-data-provider';
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
  return value !== undefined && value !== null && value !== '' && value !== false;
};

interface UseToolToggleOptions {
  conversationId?: string | null;
  toolKey: string;
  localStorageKey: LocalStorageKeys;
  isAuthenticated?: boolean;
  setIsDialogOpen?: (open: boolean) => void;
}

export function useToolToggle({
  conversationId,
  toolKey,
  localStorageKey,
  isAuthenticated,
  setIsDialogOpen,
}: UseToolToggleOptions) {
  const key = conversationId ?? Constants.NEW_CONVO;
  const [ephemeralAgent, setEphemeralAgent] = useRecoilState(ephemeralAgentByConvoId(key));

  const isToolEnabled = useMemo(() => {
    return ephemeralAgent?.[toolKey] ?? false;
  }, [ephemeralAgent, toolKey]);

  /** Track previous value to prevent infinite loops */
  const prevIsToolEnabled = useRef(isToolEnabled);

  const setValue = useCallback(
    (isChecked: boolean) => {
      setEphemeralAgent((prev) => ({
        ...prev,
        [toolKey]: isChecked,
      }));
    },
    [setEphemeralAgent, toolKey],
  );

  const [toggleState, setToggleState] = useLocalStorage<boolean>(
    `${localStorageKey}${key}`,
    isToolEnabled,
    setValue,
    storageCondition,
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>, isChecked: boolean) => {
      if (isAuthenticated !== undefined && !isAuthenticated && setIsDialogOpen) {
        setIsDialogOpen(true);
        e.preventDefault();
        return;
      }
      setToggleState(isChecked);
    },
    [setToggleState, setIsDialogOpen, isAuthenticated],
  );

  const debouncedChange = useMemo(
    () => debounce(handleChange, 50, { leading: true }),
    [handleChange],
  );

  useEffect(() => {
    if (prevIsToolEnabled.current !== isToolEnabled) {
      setToggleState(isToolEnabled);
    }
    prevIsToolEnabled.current = isToolEnabled;
  }, [isToolEnabled, setToggleState]);

  return {
    toggleState,
    handleChange,
    isToolEnabled,
    setToggleState,
    ephemeralAgent,
    debouncedChange,
    setEphemeralAgent,
  };
}
