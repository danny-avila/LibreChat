import debounce from 'lodash/debounce';
import React, { memo, useMemo, useCallback } from 'react';
import { GlobeIcon } from 'lucide-react';
import { Constants, LocalStorageKeys } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import CheckboxButton from '~/components/ui/CheckboxButton';
import useLocalStorage from '~/hooks/useLocalStorageAlt';

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

function OmnexioSearch({ conversationId }: { conversationId?: string | null }) {
  const localize = useLocalize();
  const key = conversationId ?? Constants.NEW_CONVO;

  const [omnexioSearch, setOmnexioSearch] = useLocalStorage<boolean>(
    `${LocalStorageKeys.LAST_OMNEXIO_SEARCH_TOGGLE_}${key}`,
    false,
    storageCondition,
  );

  const handleChange = useCallback(
    (isChecked: boolean) => {
      setOmnexioSearch(isChecked);
    },
    [setOmnexioSearch],
  );

  const debouncedChange = useMemo(
    () => debounce(handleChange, 50, { leading: true }),
    [handleChange],
  );

  return (
    <>
      <CheckboxButton
        className="max-w-fit"
        defaultChecked={omnexioSearch}
        setValue={debouncedChange}
        label={localize('com_omnexio_search')}
        isCheckedClassName="border-purple-600/40 bg-purple-500/10 hover:bg-purple-700/10"
        icon={<GlobeIcon className="icon-md" />}
      />
    </>
  );
}

export default memo(OmnexioSearch);
