import { useCallback, useRef } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { createChatSearchParams } from '~/utils';

export const useUpdateSearchParams = () => {
  const lastParamsRef = useRef<Record<string, string>>({});
  const [, setSearchParams] = useSearchParams();
  const location = useLocation();

  const updateSearchParams = useCallback(
    (record: Record<string, string> | null) => {
      if (record == null || location.pathname !== '/c/new') {
        return;
      }

      setSearchParams(
        (params) => {
          const currentParams = Object.fromEntries(params.entries());
          const newSearchParams = createChatSearchParams(record);
          const newParams = Object.fromEntries(newSearchParams.entries());
          const mergedParams = { ...currentParams, ...newParams };

          // If the new params are the same as the last params, don't update the search params
          if (JSON.stringify(lastParamsRef.current) === JSON.stringify(newParams)) {
            return currentParams;
          }

          lastParamsRef.current = { ...newParams };
          return mergedParams;
        },
        { replace: true },
      );
    },
    [setSearchParams, location.pathname],
  );

  return updateSearchParams;
};

export default useUpdateSearchParams;
