import { useEffect } from 'react';
import { useSetRecoilState } from 'recoil';
import { useGetSearchEnabledQuery } from '~/data-provider';
import { logger } from '~/utils';
import store from '~/store';

export default function useSearchEnabled(isAuthenticated: boolean) {
  const setSearch = useSetRecoilState(store.search);
  const searchEnabledQuery = useGetSearchEnabledQuery({ enabled: isAuthenticated });

  useEffect(() => {
    if (searchEnabledQuery.data === true) {
      setSearch((prev) => ({ ...prev, enabled: searchEnabledQuery.data }));
    } else if (searchEnabledQuery.isError) {
      logger.error('Failed to get search enabled: ', searchEnabledQuery.error);
    }
  }, [searchEnabledQuery.data, searchEnabledQuery.error, searchEnabledQuery.isError, setSearch]);

  return searchEnabledQuery;
}
