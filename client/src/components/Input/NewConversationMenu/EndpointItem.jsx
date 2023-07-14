import { useState } from 'react';
import { DropdownMenuRadioItem } from '~/components';
import { Settings } from 'lucide-react';
import getIcon from '~/utils/getIcon';
import { useRecoilValue } from 'recoil';
import { SetTokenDialog } from '../SetTokenDialog';

import store from '~/store';
import { cn, alternateName } from '~/utils';

export default function ModelItem({ endpoint, value, isSelected }) {
  const [setTokenDialogOpen, setSetTokenDialogOpen] = useState(false);
  const endpointsConfig = useRecoilValue(store.endpointsConfig);

  const icon = getIcon({
    size: 20,
    endpoint,
    error: false,
    className: 'mr-2',
    message: false,
  });

  const isUserProvided = endpointsConfig?.[endpoint]?.userProvide;

  // regular model
  return (
    <>
      <DropdownMenuRadioItem
        value={value}
        className={cn(
          'group dark:font-semibold dark:text-gray-100 dark:hover:bg-gray-800',
          isSelected && 'dark:bg-gray-800 bg-gray-50 active',
        )}
        id={endpoint}
      >
        {icon}
        {alternateName[endpoint] || endpoint}
        {endpoint === 'gptPlugins' && (
          <span className="py-0.25 ml-1 rounded bg-blue-200 px-1 text-[10px] font-semibold text-[#4559A4]">
            Beta
          </span>
        )}
        <div className="flex w-4 flex-1" />
        {isUserProvided ? (
          <button
            className={cn(
              'invisible m-0 mr-1 flex-initial rounded-md p-0 text-xs font-medium text-gray-400 hover:text-gray-700 group-hover:visible dark:font-normal dark:text-gray-400 dark:hover:text-gray-200',
              isSelected && 'visible text-gray-700 dark:text-gray-200',
            )}
            onClick={(e) => {
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
