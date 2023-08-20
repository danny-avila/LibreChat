import React, { useEffect, useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '../ui/Tabs';
import { cn } from '~/utils';
import useDocumentTitle from '~/hooks/useDocumentTitle';
import { useParams } from 'react-router-dom';
import { TUser } from '@librechat/data-provider';
import { useAuthContext } from '~/hooks/AuthContext';
import LikedConversations from './LikedConversation';
import { useRecoilValue } from 'recoil';
import store from '~/store';
import { localize } from '~/localization/Translation';
import PublicConversations from './PublicConversations';
import { Spinner } from '../svg';

function Profile() {
  const [tabValue, setTabValue] = useState<string>('');
  const [profileUser, setProfileUser] = useState<TUser | null>(null);

  const { userId } = useParams();
  const { user, token } = useAuthContext();
  const lang = useRecoilValue(store.lang);
  useDocumentTitle('Profile');

  const defaultClasses = 'p-2 rounded-md min-w-[75px] font-normal text-xs';
  const defaultSelected = cn(defaultClasses, 'font-medium data-[state=active]:text-white text-xs text-white');

  async function fetchConvoUser(id: string | undefined) {
    setProfileUser(null);
    try {
      const response = await fetch(`/api/user/${id}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const responseObject = await response.json();
      setProfileUser(responseObject);
    } catch (error) {
      console.log(error);
    }
  }

  useEffect(() => {
    if (token) fetchConvoUser(userId);
  }, [token, userId]);

  useEffect(() => {
    if (userId === user?.id) setTabValue('likes');
    else setTabValue('conversations');
  }, [user, userId]);

  return (
    <div className='flex flex-col h-full justify-center md:mx-36'>
      <div className='flex flex-row my-12'>
        <div
          title='User Icon'
          className='relative flex items-center justify-center my-1 mx-4 md:my-3 md:mx-12'
        >
          <img
            className="rounded-md"
            src={
              profileUser?.avatar ||
              `https://api.dicebear.com/6.x/initials/svg?seed=${profileUser?.name}&fontFamily=Verdana&fontSize=36&size=96`
            }
            alt="avatar"
          />
        </div>
        <div className='flex flex-col justify-center mx-3 gap-4 dark:text-white'>
          <div className='text-2xl'>
            {profileUser?.name}
          </div>
          <div className='text-2xl'>
            {profileUser?.username}
          </div>
          {/* <div className='flex flex-row gap-y-6 gap-x-12'>
            <button onClick={() => setTabValue('following')}>
              Following
            </button>
            <button onClick={() => setTabValue('followers')}>
              Followers
            </button>
          </div> */}
        </div>
      </div>
      <hr />
      <div className='flex flex-col items-center'>
        <Tabs value={tabValue} onValueChange={(value: string) => setTabValue(value)} className={defaultClasses}>
          <TabsList className="bg-white">
            {userId === user?.id && (
              <TabsTrigger value='likes' className="text-gray-500 dark:text-gray-200">
                {localize(lang, 'com_ui_my_likes')}
              </TabsTrigger>
            )}
            {userId != user?.id && (
              <TabsTrigger value='conversations' className="text-gray-500 dark:text-gray-200">
                {localize(lang, 'com_ui_conversations')}
              </TabsTrigger>
            )}
            {/* <TabsTrigger value='following' className="text-gray-500 dark:text-gray-200">
              {'Following'}
            </TabsTrigger>
            <TabsTrigger value='followers' className="text-gray-500 dark:text-gray-200">
              {'Followers'}
            </TabsTrigger> */}
          </TabsList>
        </Tabs>
      </div>
      <div className='flex flex-col h-full overflow-y-auto border-t-2'>
        {(tabValue === 'likes') && (<LikedConversations key={userId} />)}
        {(tabValue === 'conversations') && (<PublicConversations key={userId} />)}
        {(tabValue === '') && <Spinner />}
      </div>
    </div>
  );
}

export default Profile;
