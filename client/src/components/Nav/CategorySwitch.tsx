import React from 'react';
import { Tab } from '@headlessui/react';
import { cn } from '~/utils';
import { useRecoilState } from 'recoil';
import store from '~/store';

export type Category = 'Conversations' | 'Rooms';

export default function CategorySwitch() {
  const [convoType, setConvoType] = useRecoilState(store.convoType);

  return (
    <Tab.Group
      onChange={(i) => setConvoType(i === 1 ? 'r' : 'c')}
      selectedIndex={convoType === 'c' ? 0 : 1}
    >
      <Tab.List className="mt-5 flex space-x-1 rounded-xl bg-gray-200 p-1 outline-none">
        <Tab
          key="Conversations"
          value="c"
          className={({ selected }) =>
            cn(
              'w-full rounded-lg py-2 text-sm font-medium leading-5 outline-none',
              'ring-white/60 ring-offset-2 focus:outline-none focus:ring-2',
              selected
                ? 'bg-gray-400 text-white shadow'
                : 'text-black hover:bg-gray-400 hover:text-white',
            )
          }
        >
          Conversations
        </Tab>
        <Tab
          key="Rooms"
          value="r"
          className={({ selected }) =>
            cn(
              'w-full rounded-lg py-2 text-sm font-medium leading-5 outline-none',
              'ring-white/60 ring-offset-2 focus:outline-none focus:ring-2',
              selected
                ? 'bg-gray-400 text-white shadow'
                : 'text-black hover:bg-gray-400 hover:text-white',
            )
          }
        >
          Rooms
        </Tab>
      </Tab.List>
    </Tab.Group>
  );
}
