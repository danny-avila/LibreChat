import React, { useState } from 'react';
import { useGetUserQuery } from '@librechat/data-provider';
import { Tabs, TabsList, TabsTrigger } from './Tabs';
import { cn } from '~/utils';
import { useAuthContext } from '~/hooks/AuthContext';
import useDocumentTitle from '~/hooks/useDocumentTitle';

function Profile() {
  const [tabValue, setTabValue] = useState<string>('likes');

  const { user } = useAuthContext();
  useDocumentTitle('Profile');

  const defaultClasses = 'p-2 rounded-md min-w-[75px] font-normal text-xs';
  const defaultSelected = cn(defaultClasses, 'font-medium data-[state=active]:text-white text-xs text-white');

  return (
    <div className='flex flex-col justify-center md:mx-36'>
      <div className='flex flex-row my-12'>
        <div
          title='User Icon'
          className='relative flex items-center justify-center my-1 mx-4 md:my-3 md:mx-12'
        >
          <img
            className="rounded-md"
            src={
              user?.avatar ||
              `https://api.dicebear.com/6.x/initials/svg?seed=${user?.name}&fontFamily=Verdana&fontSize=36&size=96`
            }
            alt="avatar"
          />
        </div>
        <div className='flex flex-col justify-start mx-3 gap-4 dark:text-white'>
          <div className='text-2xl'>
            {user?.username}
          </div>
          <div className='flex flex-row gap-y-6 gap-x-12'>
            <button>
              Following
            </button>
            <button>
              Followers
            </button>
          </div>
        </div>
      </div>
      <hr />
      <div className='flex flex-col items-center'>
        <Tabs value={tabValue} onValueChange={(value: string) => setTabValue(value)} className={defaultClasses}>
          <TabsList className="bg-white">
            <TabsTrigger value='likes' className="text-gray-500 dark:text-gray-200">
              {'Likes'}
            </TabsTrigger>
            <TabsTrigger value='Tab-1' className="text-gray-500 dark:text-gray-200">
              {'Tab-1'}
            </TabsTrigger>
            <TabsTrigger value='Tab-2' className="text-gray-500 dark:text-gray-200">
              {'Tab-2'}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div>
        Display tab content here...
      </div>
    </div>
    // <div className='flex flex-col items-center min-h-screen gap-10'>
    //   <Tabs value='profile' className={defaultSelected}>
    //     <TabsList className="bg-blue-600 dark:bg-blue-700 text-white">
    //       <TabsTrigger value='profile' className="text-white dark:text-gray-200">
    //         {'Profile'}
    //       </TabsTrigger>
    //     </TabsList>
    //   </Tabs>
    //   <div className="flex h-full flex-col items-center text-sm dark:bg-gray-800">
    //     <div className="w-full px-6 text-center text-gray-800 dark:text-gray-100 md:flex md:max-w-2xl md:flex-col lg:max-w-3xl">
    //       <div>{`Username: ${user.username}`}</div>
    //       <div>{`Email: ${user.email}`}</div>
    //       <div>{`Fullname: ${user.fullname}`}</div>
    //     </div>
    //   </div>
    // </div>
  );
}

export default Profile;
