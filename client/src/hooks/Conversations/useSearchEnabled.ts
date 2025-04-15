import { useEffect } from 'react';
import { useSetRecoilState } from 'recoil';
import store from '~/store';
import { useGetSearchEnabledQuery } from '~/data-provider';

export default function useSearchEnabled(isAuthenticated: boolean) {
  const setSearch = useSetRecoilState(store.search);
  const searchEnabledQuery = useGetSearchEnabledQuery({ enabled: isAuthenticated });

  useEffect(() => {
    if (searchEnabledQuery.data === true) {
      setSearch((prev) => ({ ...prev, enabled: searchEnabledQuery.data }));
    } else if (searchEnabledQuery.isError) {
      console.error('Failed to get search enabled', searchEnabledQuery.error);
    }
  }, [searchEnabledQuery.data, searchEnabledQuery.error, searchEnabledQuery.isError, setSearch]);

  console.log('searchEnabledQuery', searchEnabledQuery.data);

  return searchEnabledQuery;
}
