import React, { Fragment, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import {
  Bars3Icon,
  CpuChipIcon,
  ChartPieIcon,
  DocumentDuplicateIcon,
  WrenchScrewdriverIcon,
  HomeIcon,
  UsersIcon,
  // UserGroupIcon,
  CogIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { Outlet, useNavigate } from 'react-router-dom';
import { PageContainer } from '@/common/components';
import { useAuthContext } from '~/hooks/AuthContext';

export type TNavItem = {
  name: string;
  href: string;
  icon: any;
  current: boolean;
};

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: HomeIcon, current: true },
  { name: 'Users', href: '/users', icon: UsersIcon, current: false },
  // { name: 'Groups', href: '#', icon: UserGroupIcon, current: false },
  { name: 'Models', href: '#', icon: CpuChipIcon, current: false },
  { name: 'Plugins', href: '#', icon: CogIcon, current: false },
  { name: 'Templates', href: '#', icon: DocumentDuplicateIcon, current: false },
  { name: 'Reports', href: '#', icon: ChartPieIcon, current: false },
  { name: 'Settings', href: '#', icon: WrenchScrewdriverIcon, current: false }
];

function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}

export default function Example() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarNavigation, setSidebarNavigation] = useState<TNavItem[]>(navigation);

  const navigate = useNavigate();
  const { user } = useAuthContext();

  const handleNavItemClick = (event: React.MouseEvent, item: TNavItem) => {
    event.preventDefault();
    const updatedNavigation = sidebarNavigation.map((navItem) => {
      return {
        ...navItem,
        current: navItem.name === item.name ? true : false
      };
    });
    setSidebarNavigation(updatedNavigation);
    navigate(item.href);
  };

  return (
    <>
      <div>
        <Transition.Root show={sidebarOpen} as={Fragment}>
          <Dialog as="div" className="relative z-50 lg:hidden" onClose={setSidebarOpen}>
            <Transition.Child
              as={Fragment}
              enter="transition-opacity ease-linear duration-300"
              enterFrom="opacity-0"
              enterTo="opacity-100"
              leave="transition-opacity ease-linear duration-300"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <div className="fixed inset-0 bg-gray-900/80" />
            </Transition.Child>

            <div className="fixed inset-0 flex">
              <Transition.Child
                as={Fragment}
                enter="transition ease-in-out duration-300 transform"
                enterFrom="-translate-x-full"
                enterTo="translate-x-0"
                leave="transition ease-in-out duration-300 transform"
                leaveFrom="translate-x-0"
                leaveTo="-translate-x-full"
              >
                <Dialog.Panel className="relative mr-16 flex w-full max-w-xs flex-1">
                  <Transition.Child
                    as={Fragment}
                    enter="ease-in-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in-out duration-300"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                  >
                    <div className="absolute left-full top-0 flex w-16 justify-center pt-5">
                      <button
                        type="button"
                        className="-m-2.5 p-2.5"
                        onClick={() => setSidebarOpen(false)}
                      >
                        <span className="sr-only">Close sidebar</span>
                        <XMarkIcon className="h-6 w-6 text-white" aria-hidden="true" />
                      </button>
                    </div>
                  </Transition.Child>
                  {/* Sidebar component */}
                  <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-white px-6 pb-2">
                    <div className="flex h-16 shrink-0 items-center">
                      <img
                        src="/assets/LibreChatWideMargin.svg"
                        alt="LibreChat Logo"
                        className="mr-2 h-12 w-12"
                      />
                      <h1 className="text-2xl font-bold">LibreChat</h1>
                    </div>
                    <nav className="flex flex-1 flex-col">
                      <ul role="list" className="flex flex-1 flex-col gap-y-7">
                        <li>
                          <ul role="list" className="-mx-2 space-y-1">
                            {sidebarNavigation.map((item) => (
                              <li key={item.name}>
                                <a
                                  onClick={(e) => handleNavItemClick(e, item)}
                                  className={classNames(
                                    item.current
                                      ? 'bg-gray-50 text-indigo-600'
                                      : 'text-gray-700 hover:bg-gray-50 hover:text-indigo-600',
                                    'group flex cursor-pointer gap-x-3 rounded-md p-2 text-sm font-semibold leading-6'
                                  )}
                                >
                                  <item.icon
                                    className={classNames(
                                      item.current
                                        ? 'text-indigo-600'
                                        : 'text-gray-400 group-hover:text-indigo-600',
                                      'h-6 w-6 shrink-0'
                                    )}
                                    aria-hidden="true"
                                  />
                                  {item.name}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </li>
                      </ul>
                    </nav>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </Dialog>
        </Transition.Root>

        {/* Static sidebar for desktop */}
        <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-64 lg:flex-col">
          <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r border-gray-200 bg-gray-50 px-6">
            <div className="flex h-16 shrink-0 items-center">
              <img
                src="/assets/LibreChatWideMargin.svg"
                alt="LibreChat Logo"
                className="mr-2 h-12 w-12"
              />
              <h1 className="text-2xl font-bold">LibreChat</h1>
            </div>
            <nav className="flex flex-1 flex-col">
              <ul role="list" className="flex flex-1 flex-col gap-y-7">
                <li>
                  <ul role="list" className="-mx-2 space-y-1">
                    {sidebarNavigation.map((item) => (
                      <li key={item.name}>
                        <a
                          onClick={(e) => handleNavItemClick(e, item)}
                          className={classNames(
                            item.current
                              ? 'bg-green-100 text-indigo-600'
                              : 'text-gray-700 hover:bg-gray-100 hover:text-indigo-600',
                            'group flex cursor-pointer gap-x-3 rounded-md p-2 text-sm font-semibold leading-6'
                          )}
                        >
                          <item.icon
                            className={classNames(
                              item.current
                                ? 'text-indigo-600'
                                : 'text-gray-400 group-hover:text-indigo-600',
                              'h-6 w-6 shrink-0'
                            )}
                            aria-hidden="true"
                          />
                          {item.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                </li>
                <li className="-mx-6 mt-auto border-t">
                  <a
                    href="#"
                    className="flex items-center gap-x-4 px-6 py-3 text-sm font-semibold leading-6 text-gray-900 hover:bg-gray-50"
                  >
                    <div className="-ml-0.5 h-5 w-5 flex-shrink-0">
                      <div className="relative flex">
                        <img
                          className="rounded-sm"
                          src={
                            user?.avatar ||
                            `https://api.dicebear.com/6.x/initials/svg?seed=${
                              user?.name || 'User'
                            }&fontFamily=Verdana&fontSize=36`
                          }
                          alt={user?.name || 'USER'}
                        />
                      </div>
                    </div>
                    <div className="grow overflow-hidden text-ellipsis whitespace-nowrap text-left dark:text-white">
                      {user?.name || 'USER'}
                    </div>
                  </a>
                </li>
              </ul>
            </nav>
          </div>
        </div>

        <div className="sticky top-0 z-40 flex items-center gap-x-6 bg-white px-4 py-4 shadow-sm sm:px-6 lg:hidden">
          <button
            type="button"
            className="-m-2.5 p-2.5 text-gray-700 lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <span className="sr-only">Open sidebar</span>
            <Bars3Icon className="h-6 w-6" aria-hidden="true" />
          </button>
          <div className="flex-1 text-sm font-semibold leading-6 text-gray-900">Dashboard</div>
          <a href="#">
            <span className="sr-only">{user?.name || 'USER'}</span>
            <img
              className="h-8 w-8 rounded-full"
              src={
                user?.avatar ||
                `https://api.dicebear.com/6.x/initials/svg?seed=${
                  user?.name || 'User'
                }&fontFamily=Verdana&fontSize=36`
              }
              alt={user?.name || 'USER'}
            />
          </a>
        </div>

        <main className="lg:pl-64">
          {/* <div className="xl:pl-96"> */}
          <div className="px-4 py-10 sm:px-6 lg:px-8 lg:py-6">
            <PageContainer>
              <Outlet />
            </PageContainer>
          </div>
          {/* </div> */}
        </main>

        {/* <aside className="fixed inset-y-0 left-72 hidden w-96 overflow-y-auto border-r border-gray-200 px-4 py-6 sm:px-6 lg:px-8 xl:block"> */}
        {/* Secondary column (hidden on smaller screens) */}
        {/* </aside> */}
      </div>
    </>
  );
}
