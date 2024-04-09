import React, { Dispatch, SetStateAction, useState } from 'react';
import { Tab } from '@headlessui/react';
import { cn } from '~/utils';

export type Category = 'Conversations' | 'Rooms';

interface Props {
  category: Category;
  setCategory: Dispatch<SetStateAction<Category>>;
}

export default function CategorySwtich({ category, setCategory }: Props) {
  const [categories] = useState({
    Conversations: [],
    Rooms: [],
  });

  return (
    <Tab.Group>
      <Tab.List className="mt-5 flex space-x-1 rounded-xl bg-gray-200 p-1 outline-none">
        {Object.keys(categories).map((category) => (
          <Tab
            key={category}
            value={category}
            onClick={() => setCategory(category as Category)}
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
            {category}
          </Tab>
        ))}
      </Tab.List>
    </Tab.Group>
  );
}
