import React, { Dispatch, ReactNode, SetStateAction } from 'react';
import { AnthropicIcon, GoogleIconChat, OpenAIMinimalIcon, SdImageIcon } from '../svg';
import { useRecoilState } from 'recoil';
import { EndpointKeyTypes, SearchOptions, SortKeyTypes } from '~/store/conversation';
import store from '~/store';

const SortSelect = (
  { searchOptions, setSearchOptions }:
  { searchOptions: SearchOptions; setSearchOptions: Dispatch<SetStateAction<SearchOptions>> }) => (
  <select
    className='rounded p-1 border-none w-40 outline-none dark:bg-black dark:text-white'
    value={searchOptions.sort}
    onChange={e => setSearchOptions({ ...searchOptions, sort: e.currentTarget.value as SortKeyTypes })}
    defaultValue={'none'}
  >
    <option value={'none'}>All</option>
    <option value={'participants-asc'}>Most Participants</option>
    <option value={'participants-desc'}>Least Participants</option>
    <option value={'date-asc'}>Most Newest</option>
    <option value={'date-desc'}>Most Oldest</option>
  </select>
);

const endpointSorts: Array<{id: EndpointKeyTypes; icon: ReactNode}> = [
  {
    id: 'openAI',
    icon: <OpenAIMinimalIcon className='dark:text-gray-50' />,
  },
  {
    id: 'google',
    icon: <GoogleIconChat className='dark:text-gray-50' />,
  },
  {
    id: 'anthropic',
    icon: <AnthropicIcon className='dark:text-gray-50' />,
  },
  {
    id: 'sdImage',
    icon: <SdImageIcon />,
  },
];

export default function EndpointSelect() {
  const [searchOptions, setSearchOptions] = useRecoilState<SearchOptions>(store.searchOptions);

  return (
    <div className='w-full'>
      <div className='flex gap-1 w-full justify-around mt-2'>
        {endpointSorts.map(endpoint => <button
          onClick={() => {
            if (endpoint.id == searchOptions.endpoint) {
              setSearchOptions({ ...searchOptions, endpoint: null });
              return;
            }
            setSearchOptions({ ...searchOptions, endpoint: endpoint.id });
          }}
          className={`border-2 rounded-md border-gray-500 p-1 w-10 h-10 flex justify-center items-center transition ${searchOptions.endpoint === endpoint.id ? 'bg-gray-300 dark:bg-gray-600' : ''}`}
          key={endpoint.id}
        >
          {endpoint.icon}
        </button>)}
      </div>
      <div className='w-full flex gap-1 flex-start mt-3 items-center'>
        <i className='text-black dark:text-white not-italic'>Sort By:</i> <SortSelect searchOptions={searchOptions} setSearchOptions={setSearchOptions} />
      </div>
    </div>
  );
}
