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
  const [copied, setCopied] = useState<boolean>(false);

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
    fetchConvoUser(userId);
  }, [userId]);

  useEffect(() => {
    if (userId === user?.id) setTabValue('likes');
    else setTabValue('conversations');
  }, [user, userId]);

  return (
    <div className='flex flex-col h-full justify-center md:mx-36'>
      <div className='flex flex-row flex-wrap mt-6 mb-3 md:my-12'>
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
        <div className='flex flex-row ml-5 py-3 text-xl gap-4 items-center md:ml-9'>
          <button
            className='w-32 text-gray-600 hover:text-black'
            onClick={() => {
              if (copied) return;
              setCopied(true);
              window.navigator.clipboard.writeText(window.location.href);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            <div className='flex flex-col items-center'>
              {copied ? (
                <>
                  <svg
                    stroke="currentColor"
                    fill="none"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-5 w-5"
                    height="1em"
                    width="1em"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {localize(lang, 'com_ui_copy_success')}
                </>
              ) : (
                <>
                  <svg className="h-5 w-5" width="1em" height="1em" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <g id="Communication / Share_iOS_Export">
                      <path id="Vector" d="M9 6L12 3M12 3L15 6M12 3V13M7.00023 10C6.06835 10 5.60241 10 5.23486 10.1522C4.74481 10.3552 4.35523 10.7448 4.15224 11.2349C4 11.6024 4 12.0681 4 13V17.8C4 18.9201 4 19.4798 4.21799 19.9076C4.40973 20.2839 4.71547 20.5905 5.0918 20.7822C5.5192 21 6.07899 21 7.19691 21H16.8036C17.9215 21 18.4805 21 18.9079 20.7822C19.2842 20.5905 19.5905 20.2839 19.7822 19.9076C20 19.4802 20 18.921 20 17.8031V13C20 12.0681 19.9999 11.6024 19.8477 11.2349C19.6447 10.7448 19.2554 10.3552 18.7654 10.1522C18.3978 10 17.9319 10 17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </g>
                  </svg>
                  {localize(lang, 'com_ui_share_profile')}
                </>

              )}
            </div>
          </button>
          {/* <button className='w-24 text-start text-gray-600 hover:text-black'>
            {localize(lang, 'com_ui_followers')}
          </button>
          <button className='w-24 text-start text-gray-600 hover:text-black'>
            {localize(lang, 'com_ui_following')}
          </button> */}
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
