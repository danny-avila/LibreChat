import React, { useEffect, useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '../ui/Tabs';
import { cn } from '~/utils';
import useDocumentTitle from '~/hooks/useDocumentTitle';
import { useNavigate, useParams } from 'react-router-dom';
import { TUser, useFollowUserMutation, useGetUserByIdQuery } from '@librechat/data-provider';
import { useAuthContext } from '~/hooks/AuthContext';
import LikedConversations from './LikedConversation';
import { useRecoilValue } from 'recoil';
import store from '~/store';
import { localize } from '~/localization/Translation';
import PublicConversations from './PublicConversations';
import { Spinner } from '../svg';
import UserIcon from '../svg/UserIcon';

function ProfileContent() {
  const [tabValue, setTabValue] = useState<string>('');
  const [profileUser, setProfileUser] = useState<TUser | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [isFollower, setIsFollower] = useState<boolean>(false);
  const [numOfFollowers, setNumOfFollowers] = useState<number>(0);
  const [numOfFollowing, setNumOfFollowing] = useState<number>(0);

  const { userId = '' } = useParams();
  const { user } = useAuthContext();
  const lang = useRecoilValue(store.lang);
  const navigate = useNavigate();
  useDocumentTitle('Profile');

  const getUserByIdQuery = useGetUserByIdQuery(userId);
  const followUserMutation = useFollowUserMutation();

  const defaultClasses = 'p-2 rounded-md min-w-[75px] font-normal text-xs';
  const defaultSelected = cn(defaultClasses, 'font-medium data-[state=active]:text-white text-xs text-white');

  // Component to display user's followers and who they are following
  // Displays username only
  function ListItem({ id, info }: { id: string, info: TUser }) {
    const [copied, setCopied] = useState<boolean>(false);
    const lang = useRecoilValue(store.lang);

    return(
      <div className="group relative flex flex-row items-center cursor-pointer my-2" >
        <div
          className='flex flex-row h-full w-full items-center rounded-lg px-2 py-2 gap-2 text-lg hover:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-600'
          onClick={() => { navigate(`/profile/${id}`) }}
        >
          <UserIcon />
          <div className='w-56 truncate'>
            {info.username}
          </div>
        </div>

        {/*Copy profile URL button */}
        <button
          className='visible absolute rounded-md right-1 z-10 p-1 hover:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-600'
          onClick={() => {
            if (copied === true) return;

            navigator.clipboard.writeText(window.location.host + `/profile/${id}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? (
            <div className='flex flex-row items-center gap-1 w-[92px]'>
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
            </div>
          ) : (
            <div className='flex flex-row items-center gap-1 w-[92px]'>
              <svg className="h-5 w-5" width="1em" height="1em" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <g id="Communication / Share_iOS_Export">
                  <path id="Vector" d="M9 6L12 3M12 3L15 6M12 3V13M7.00023 10C6.06835 10 5.60241 10 5.23486 10.1522C4.74481 10.3552 4.35523 10.7448 4.15224 11.2349C4 11.6024 4 12.0681 4 13V17.8C4 18.9201 4 19.4798 4.21799 19.9076C4.40973 20.2839 4.71547 20.5905 5.0918 20.7822C5.5192 21 6.07899 21 7.19691 21H16.8036C17.9215 21 18.4805 21 18.9079 20.7822C19.2842 20.5905 19.5905 20.2839 19.7822 19.9076C20 19.4802 20 18.921 20 17.8031V13C20 12.0681 19.9999 11.6024 19.8477 11.2349C19.6447 10.7448 19.2554 10.3552 18.7654 10.1522C18.3978 10 17.9319 10 17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </g>
              </svg>
              {localize(lang, 'com_ui_copy_link')}
            </div>
          )}
        </button>
      </div>
    );
  }

  const followUserController = () => {
    const payload = {
      user: user,
      otherUser: profileUser
    }

    if (profileUser) {
      if (profileUser.followers && profileUser.followers[`${user?.id}`]) {
        payload['isFollowing'] = false;
      } else {
        payload['isFollowing'] = true;
      }
    }

    followUserMutation.mutate(payload);
  }

  useEffect(() => {
    if (getUserByIdQuery.isSuccess) {
      setProfileUser(getUserByIdQuery.data);

      if (getUserByIdQuery.data.followers) {
        setIsFollower(getUserByIdQuery.data.followers[`${user?.id}`] ? true : false);
        setNumOfFollowers(Object.keys(getUserByIdQuery.data.followers).length);
      } else {
        setIsFollower(false);
        setNumOfFollowers(0);
      }

      if (getUserByIdQuery.data.following) {
        setNumOfFollowing(Object.keys(getUserByIdQuery.data.following).length);
      } else {
        setNumOfFollowing(0);
      }
    }
  }, [getUserByIdQuery.isSuccess, getUserByIdQuery.data, user]);

  useEffect(() => {
    if (userId === user?.id) setTabValue('likes');
    else setTabValue('conversations');
  }, [user, userId]);

  useEffect(() => {
    if (followUserMutation.isSuccess) {
      setProfileUser(followUserMutation.data);
      setIsFollower(!isFollower);

      if (followUserMutation.data.followers) {
        setNumOfFollowers(Object.keys(followUserMutation.data.followers).length);
      }

      if (followUserMutation.data.following) {
        setNumOfFollowing(Object.keys(followUserMutation.data.following).length);
      }
    }
  }, [followUserMutation.isSuccess, followUserMutation.data]);

  return (
    <div className='flex flex-col h-full justify-center md:mx-36'>
      <div className='flex flex-col md:flex-row md:gap-6 items-start flex-wrap mt-6 mb-3 md:my-12'>
        {/*User icon, full name, and username */}
        <div className='flex flex row items-center'>
          <div
            title='User Icon'
            className='relative flex items-center justify-center my-1 mx-4 md:my-3 md:ml-12'
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
          <div className='flex flex-col justify-center mx-3 gap-4 dark:text-gray-200 text-2xl'>
            <div>
              {profileUser?.name}
            </div>
            <div>
              {profileUser?.username}
            </div>
          </div>
        </div>
        {/*Copy profile page URL button */}
        <div className='flex flex-row self-center px-3 py-3 text-xl gap-4 items-center'>
          <button
            className='w-32 text-gray-600 hover:text-black dark:text-gray-400 dark:hover:text-gray-200'
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
          {/*Number of followers */}
          <button
            className='flex flex-col leading-[22px] items-center w-24 text-gray-600 hover:text-black dark:text-gray-400 dark:hover:text-gray-200'
            onClick={() => {setTabValue('followers')}}
          >
            {numOfFollowers}
            <br />
            {localize(lang, 'com_ui_followers')}
          </button>
          {/*Number of following */}
          <button
            className='flex flex-col leading-[22px] items-center w-24 text-gray-600 hover:text-black dark:text-gray-400 dark:hover:text-gray-200'
            onClick={() => {setTabValue('following')}}
          >
            {numOfFollowing}
            <br />
            {localize(lang, 'com_ui_following')}
          </button>
        </div>
        {/*Follow user button */}
        {(userId !== user?.id && profileUser && user) &&
          <button
            className='self-center w-24 px-3 py-1 text-lg text-center font-bold rounded-md bg-gray-200 text-gray-800 hover:text-black dark:bg-gray-600 dark:text-gray-400 dark:hover:text-gray-200'
            onClick={ followUserController }
          >
            {isFollower ? localize(lang, 'com_ui_unfollow') : localize(lang, 'com_ui_follow')}
          </button>
        }
      </div>
      <hr />
      {/*Tabs and tab content */}
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
            <TabsTrigger value='followers' className="text-gray-500 dark:text-gray-200">
              {localize(lang, 'com_ui_followers')}
            </TabsTrigger>
            <TabsTrigger value='following' className="text-gray-500 dark:text-gray-200">
              {localize(lang, 'com_ui_following')}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className='flex flex-col h-full overflow-y-auto border-t-2'>
        {(tabValue === 'likes') && (<LikedConversations key={userId} />)}
        {(tabValue === 'conversations') && (<PublicConversations key={userId} />)}

        {/*New followers and follwings are added at the end of the object in MongoDB. */}
        {/*We reverse the array to dsiplay the most recent follwers and followings at the top. */}
        {(tabValue === 'followers') && (
          <div>
            {
              Object.entries(profileUser ? profileUser.followers : {}).reverse().map(([id, info]) =>
                <ListItem key={id} id={id} info={info}/>)
            }
          </div>
        )}
        {(tabValue === 'following') && (
          <div>
            {
              Object.entries(profileUser ? profileUser.following : {}).reverse().map(([id, info]) =>
                <ListItem key={id} id={id} info={info}/>)
            }
          </div>
        )}
        {(tabValue === '') && <Spinner />}
      </div>
    </div>
  );
}

// To avoid internal state mixture
function Profile() {
  const { userId } = useParams();

  return <ProfileContent key={ userId } />
}

export default Profile;
