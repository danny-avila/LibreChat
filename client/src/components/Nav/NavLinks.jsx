import { Menu, Transition } from '@headlessui/react';
import { Fragment, useEffect, useRef, useState } from 'react';
import SearchBar from './SearchBar';
import ClearConvos from './ClearConvos';
import DarkMode from './DarkMode';
import Logout from './Logout';
import ExportConversation from './ExportConversation';
import { useAuthContext } from '~/hooks/AuthContext';
import { cn } from '~/utils/';
import DotsIcon from '../svg/DotsIcon';

export default function NavLinks({ clearSearch, isSearchEnabled }) {
  const { user, logout } = useAuthContext();
  return (
    <Menu
      as="div"
      className="group relative"
    >
      {({ open, close }) => (
        <>
          <Menu.Button
            className={cn(
              'group-ui-open:bg-gray-800 flex w-full items-center gap-2.5 rounded-md px-3 py-3 text-sm transition-colors duration-200 hover:bg-gray-800',
              open ? 'bg-gray-800' : ''
            )}
          >
            <div class="-ml-0.5 h-5 w-5 flex-shrink-0">
              <div class="relative flex">
                <img
                  class="rounded-sm"
                  src={user?.avatar || `https://avatars.dicebear.com/api/initials/${user?.name}.svg`}
                  alt=""
                />
              </div>
            </div>
            <div class="grow overflow-hidden text-ellipsis whitespace-nowrap text-left text-white">
              {user?.name || 'USER'}
            </div>
            <DotsIcon />
          </Menu.Button>

          <Transition
            as={Fragment}
            enter="transition ease-out duration-100"
            enterFrom="transform opacity-0 scale-95"
            enterTo="transform opacity-100 scale-100"
            leave="transition ease-in duration-75"
            leaveFrom="transform opacity-100 scale-100"
            leaveTo="transform opacity-0 scale-95"
          >
            <Menu.Items className="absolute bottom-full left-0 z-20 mb-2 w-full translate-y-0 overflow-hidden rounded-md bg-[#050509] py-1.5 opacity-100 outline-none">
              <Menu.Item
                onClick={close}
                as="a"
              >
                {!!isSearchEnabled && <SearchBar clearSearch={clearSearch} />}
              </Menu.Item>
              <Menu.Item
                as="a"
              >
                <ExportConversation />
              </Menu.Item>

              <div
                class="my-1.5 h-px bg-white/20"
                role="none"
              ></div>
              <Menu.Item
                onClick={close}
                as="a"
              >
                <DarkMode />
              </Menu.Item>
              <Menu.Item
                as="a"
              >
                <ClearConvos />
              </Menu.Item>

              <div
                class="my-1.5 h-px bg-white/20"
                role="none"
              ></div>
              <Menu.Item
                onClick={close}
                as="a"
              >
                <Logout />
              </Menu.Item>
            </Menu.Items>
          </Transition>
        </>
      )}
    </Menu>
  );
}
