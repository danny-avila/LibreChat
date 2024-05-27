import React from 'react';
import { Tab } from '@headlessui/react';
import { cn } from '~/utils';

export type Category = 'Conversations' | 'Rooms';

export default function CategorySwitch({ convoType, setConvoType }) {
  return (
    <Tab.Group
      onChange={(i) => setConvoType(i === 1 ? 'r' : 'c')}
      selectedIndex={convoType === 'c' ? 0 : 1}
    >
      <Tab.List className="mt-5 flex space-x-1 rounded-xl bg-gray-200 p-1 outline-none dark:bg-gray-750">
        <Tab
          key="Rooms"
          value="r"
          className={({ selected }) =>
            cn(
              'w-full rounded-lg py-2 text-sm font-medium leading-5 outline-none',
              'ring-white/60 ring-offset-2 focus:outline-none focus:ring-2',
              selected
                ? 'bg-gray-400 text-white shadow dark:bg-gray-700 dark:hover:bg-gray-700'
                : 'text-black hover:bg-gray-400 hover:text-white dark:text-white dark:hover:bg-gray-700',
            )
          }
        >
          Chat Groups
        </Tab>
        <Tab
          key="Conversations"
          value="c"
          className={({ selected }) =>
            cn(
              'w-full rounded-lg py-2 text-sm font-medium leading-5 outline-none',
              'ring-white/60 ring-offset-2 focus:outline-none focus:ring-2',
              selected
                ? 'bg-gray-400 text-white shadow dark:bg-gray-700 dark:hover:bg-gray-700'
                : 'text-black hover:bg-gray-400 hover:text-white dark:text-white dark:hover:bg-gray-700',
            )
          }
        >
          Conversations
        </Tab>
      </Tab.List>
    </Tab.Group>
  );
}
