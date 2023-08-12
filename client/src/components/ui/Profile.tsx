import React, { useEffect, useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from './Tabs';
import { cn } from '~/utils';
import useDocumentTitle from '~/hooks/useDocumentTitle';
import { useParams } from 'react-router-dom';
import { TUser } from '@librechat/data-provider';
import { useAuthContext } from '~/hooks/AuthContext';

function Profile() {
  const [tabValue, setTabValue] = useState<string>('likes');
  const [user, setUser] = useState<TUser | null>(null);

  const { userId } = useParams();
  const { token } = useAuthContext();
  useDocumentTitle('Profile');

  const defaultClasses = 'p-2 rounded-md min-w-[75px] font-normal text-xs';
  const defaultSelected = cn(defaultClasses, 'font-medium data-[state=active]:text-white text-xs text-white');

  async function fetchConvoUser(id: string | undefined) {
    setUser(null);
    try {
      const response = await fetch(`/api/user/${id}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const responseObject = await response.json();
      setUser(responseObject);
    } catch (error) {
      console.log(error);
    }
  }

  useEffect(() => {
    if (token) fetchConvoUser(userId);
  }, [token, userId]);

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
            <button onClick={() => setTabValue('following')}>
              Following
            </button>
            <button onClick={() => setTabValue('followers')}>
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
            <TabsTrigger value='conversations' className="text-gray-500 dark:text-gray-200">
              {'Conversations'}
            </TabsTrigger>
            <TabsTrigger value='following' className="text-gray-500 dark:text-gray-200">
              {'Following'}
            </TabsTrigger>
            <TabsTrigger value='followers' className="text-gray-500 dark:text-gray-200">
              {'Followers'}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div>
        Display tab content here...
      </div>
    </div>
  );
}

export default Profile;
