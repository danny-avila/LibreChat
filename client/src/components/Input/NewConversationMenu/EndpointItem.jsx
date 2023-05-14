import React, { useState } from 'react';
import { DropdownMenuRadioItem } from '../../ui/DropdownMenu.tsx';
import { Settings } from 'lucide-react';
import getIcon from '~/utils/getIcon';
import { useRecoilValue } from 'recoil';
import SetTokenDialog from '../SetTokenDialog';

import store from '../../../store';

const alternateName = {
  openAI: 'OpenAI',
  azureOpenAI: 'Azure OpenAI',
  bingAI: 'Bing',
  chatGPTBrowser: 'ChatGPT',
  google: 'PaLM',
}

export default function ModelItem({ endpoint, value, onSelect }) {
  const [setTokenDialogOpen, setSetTokenDialogOpen] = useState(false);
  const endpointsConfig = useRecoilValue(store.endpointsConfig);

  const icon = getIcon({
    size: 20,
    endpoint,
    error: false,
    className: 'mr-2'
  });

  const isuserProvide = endpointsConfig?.[endpoint]?.userProvide;

  // regular model
  return (
    <>
      <DropdownMenuRadioItem
        value={value}
        className="group dark:font-semibold dark:text-gray-100 dark:hover:bg-gray-800"
      >
        {icon}
        {alternateName[endpoint] || endpoint}
        {!!['azureOpenAI', 'openAI'].find(e => e === endpoint) && <sup>$</sup>}
        <div className="flex w-4 flex-1" />
        {isuserProvide ? (
          <button
            className="invisible m-0 mr-1 flex-initial rounded-md p-0 text-xs font-medium text-gray-400 hover:text-gray-700 group-hover:visible dark:font-normal dark:text-gray-400 dark:hover:text-gray-200"
            onClick={e => {
              e.preventDefault();
              setSetTokenDialogOpen(true);
            }}
          >
            <Settings className="mr-1 inline-block w-[16px] items-center stroke-1" />
            Config Token
          </button>
        ) : null}
      </DropdownMenuRadioItem>
      <SetTokenDialog
        open={setTokenDialogOpen}
        onOpenChange={setSetTokenDialogOpen}
        endpoint={endpoint}
      />
    </>
  );
}
