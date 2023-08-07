import React from 'react';
import { useGetUserQuery } from '@librechat/data-provider';
import { Tabs, TabsList, TabsTrigger } from './Tabs';
import { cn } from '~/utils';
import { useRecoilState } from 'recoil';
import store from '~/store';

const Profile = ({ onClose }) => {
  const { data: user, isLoading, error } = useGetUserQuery();

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>An error occurred: {error.message}</div>;

  const defaultClasses = 'p-2 rounded-md min-w-[75px] font-normal bg-white/[.60] dark:bg-gray-700 text-black text-xs';
  const defaultSelected = cn(defaultClasses, 'font-medium data-[state=active]:text-white text-xs text-white');

  return (
    <div className='flex flex-col items-center min-h-screen gap-10'>
      <Tabs value='profile' className={defaultSelected}>
        <TabsList className="bg-white/[.60] dark:bg-gray-700">
          <TabsTrigger value='profile'>
            {'Profile'}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex h-full flex-col items-center text-sm dark:bg-gray-800">
        <div className="w-full px-6 text-center text-gray-800 dark:text-gray-100 md:flex md:max-w-2xl md:flex-col lg:max-w-3xl">
          <div>{`Username: ${user.username}`}</div>
          <div>{`Email: ${user.email}`}</div>
          <div>{`Fullname: ${user.fullname}`}</div>
        </div>
      </div>
    </div>
  );
}

export default Profile;
