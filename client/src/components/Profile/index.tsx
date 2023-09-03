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
import { log } from 'console';
import  EditIcon from '../svg/EditIcon';

function ProfileContent() {
  let initialBio = '来个大开脑洞，自爆一下你的人生经验，让大家开开眼界！';
  // let initialProfession = '未填写';
  const [tabValue, setTabValue] = useState<string>('');
  const [profileUser, setProfileUser] = useState<TUser | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [isFollower, setIsFollower] = useState<boolean>(false);
  const [numOfFollowers, setNumOfFollowers] = useState<number>(0);
  const [numOfFollowing, setNumOfFollowing] = useState<number>(0);
  const [editMode, setEditMode] = useState<boolean>(false);
  const [bio, setBio] = useState(initialBio || '');
  // const [profession, setProfession] = useState(initialProfession || '');

  const { userId = '' } = useParams();
  const { user, token } = useAuthContext();
  const lang = useRecoilValue(store.lang);
  const navigate = useNavigate();
  useDocumentTitle('Profile');

  const getUserByIdQuery = useGetUserByIdQuery(userId);
  const followUserMutation = useFollowUserMutation();

  const defaultClasses = 'p-2 rounded-md min-w-[75px] font-normal text-xs';
  const defaultSelected = cn(
    defaultClasses,
    'font-medium data-[state=active]:text-white text-xs text-white'
  );

  // Component to display user's followers and who they are following
  // Displays username only
  function ListItem({ id, info }: { id: string; info: TUser }) {
    const [copied, setCopied] = useState<boolean>(false);
    const lang = useRecoilValue(store.lang);

    return (
      <div className="group relative my-2 flex cursor-pointer flex-row items-center">
        <div
          className="flex h-full w-full flex-row items-center gap-2 rounded-lg px-2 py-2 text-base hover:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-600"
          onClick={() => {
            navigate(`/profile/${id}`);
          }}
        >
          <UserIcon />
          <div className="w-56 truncate">{info.username}</div>
        </div>

        {/*Copy profile URL button */}
        <button
          className="visible absolute right-1 z-10 rounded-md p-1 hover:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-600"
          onClick={() => {
            if (copied === true) return;

            navigator.clipboard.writeText(window.location.host + `/profile/${id}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? (
            <div className="flex w-[92px] flex-row items-center gap-1">
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
            <div className="flex w-[92px] flex-row items-center gap-1">
              <svg
                className="h-5 w-5"
                width="1em"
                height="1em"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <g id="Communication / Share_iOS_Export">
                  <path
                    id="Vector"
                    d="M9 6L12 3M12 3L15 6M12 3V13M7.00023 10C6.06835 10 5.60241 10 5.23486 10.1522C4.74481 10.3552 4.35523 10.7448 4.15224 11.2349C4 11.6024 4 12.0681 4 13V17.8C4 18.9201 4 19.4798 4.21799 19.9076C4.40973 20.2839 4.71547 20.5905 5.0918 20.7822C5.5192 21 6.07899 21 7.19691 21H16.8036C17.9215 21 18.4805 21 18.9079 20.7822C19.2842 20.5905 19.5905 20.2839 19.7822 19.9076C20 19.4802 20 18.921 20 17.8031V13C20 12.0681 19.9999 11.6024 19.8477 11.2349C19.6447 10.7448 19.2554 10.3552 18.7654 10.1522C18.3978 10 17.9319 10 17 10"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              </svg>
              {localize(lang, 'com_ui_share')}
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
    };

    if (profileUser) {
      if (profileUser.followers && profileUser.followers[`${user?.id}`]) {
        payload['isFollowing'] = false;
        delete user?.following[profileUser.id];
      } else {
        payload['isFollowing'] = true;
        if (user) user.following[profileUser.id] = new Date();
      }
    }

    followUserMutation.mutate(payload);
  };

  const handleEditProfile = (): void => {
    if (bio === '') {
      setBio(initialBio); // Reset bio to initial value if it's empty
    }
    setEditMode((prev) => !prev);
  };

  // submit biography
  const handleSubmit = async (e) => {
    e.preventDefault();
    const requestBody = {
      biography: bio
      // profession: profession
    };

    try {
      const bioResponse = await fetch(`/api/user/${userId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(requestBody)
      });
      if (bioResponse.ok) {
        const responseData = await bioResponse.json();
        if (responseData.biography === '') {
          setBio(initialBio);
        } else {
          setBio(responseData.biography);
        }
        handleEditProfile();
      }
    } catch (error) {
      alert(`An error occurred: ${error}`);
    }
  };

  useEffect(() => {
    if (getUserByIdQuery.isSuccess) {
      setProfileUser(getUserByIdQuery.data);
      // Set biography from fetched data or use initial value
      // Set biography from fetched data or use initial value
      if (getUserByIdQuery.data?.biography === '') {
        setBio(initialBio);
      } else {
        setBio(getUserByIdQuery.data?.biography);
      }

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

  // toggle expand button
  const [expanded, setExpanded] = useState(false);

  const toggleExpand = () => {
    setExpanded((prev) => !prev);
  };

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
    <div className="flex h-full flex-col justify-center md:mx-36">
      <div className="mt-6 flex flex-col flex-wrap items-start md:my-4 md:flex-row md:gap-6">
        {/*User icon, full name, and username */}
        <div className="row flex flex items-center">
          <div
            title="User Icon"
            className="relative mx-4 my-1 flex items-center justify-center md:my-3 md:ml-12"
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
          <div className="mx-3 flex flex-col justify-center gap-4 text-xl dark:text-gray-200">
            <div>{profileUser?.name}</div>
            <div>{profileUser?.username}</div>
          </div>
        </div>
        {/*Copy profile page URL button */}
        <div className="flex flex-row items-center gap-4 self-center px-3 py-3 text-lg">
          <button
            className="w-32 text-gray-600 hover:text-black dark:text-gray-400 dark:hover:text-gray-200"
            onClick={() => {
              if (copied) return;
              setCopied(true);
              window.navigator.clipboard.writeText(window.location.href);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            <div className="flex flex-col items-center">
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
                  <svg
                    className="h-5 w-5"
                    width="1em"
                    height="1em"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <g id="Communication / Share_iOS_Export">
                      <path
                        id="Vector"
                        d="M9 6L12 3M12 3L15 6M12 3V13M7.00023 10C6.06835 10 5.60241 10 5.23486 10.1522C4.74481 10.3552 4.35523 10.7448 4.15224 11.2349C4 11.6024 4 12.0681 4 13V17.8C4 18.9201 4 19.4798 4.21799 19.9076C4.40973 20.2839 4.71547 20.5905 5.0918 20.7822C5.5192 21 6.07899 21 7.19691 21H16.8036C17.9215 21 18.4805 21 18.9079 20.7822C19.2842 20.5905 19.5905 20.2839 19.7822 19.9076C20 19.4802 20 18.921 20 17.8031V13C20 12.0681 19.9999 11.6024 19.8477 11.2349C19.6447 10.7448 19.2554 10.3552 18.7654 10.1522C18.3978 10 17.9319 10 17 10"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </g>
                  </svg>
                  {localize(lang, 'com_ui_share_profile')}
                </>
              )}
            </div>
          </button>
          {/*Number of followers */}
          <button
            className="flex w-24 flex-col items-center leading-[22px] text-gray-600 hover:text-black dark:text-gray-400 dark:hover:text-gray-200"
            onClick={() => {
              setTabValue('followers');
            }}
          >
            {numOfFollowers}
            <br />
            {localize(lang, 'com_ui_followers')}
          </button>
          {/*Number of following */}
          <button
            className="flex w-24 flex-col items-center leading-[22px] text-gray-600 hover:text-black dark:text-gray-400 dark:hover:text-gray-200"
            onClick={() => {
              setTabValue('following');
            }}
          >
            {numOfFollowing}
            <br />
            {localize(lang, 'com_ui_following')}
          </button>
        </div>
        {/*Follow user button */}
        {userId !== user?.id && profileUser && user && (
          <button
            className="w-24 self-center rounded-md bg-gray-200 px-3 py-1 text-center text-lg font-bold text-gray-800 hover:text-black dark:bg-gray-600 dark:text-gray-400 dark:hover:text-gray-200"
            onClick={followUserController}
          >
            {isFollower ? localize(lang, 'com_ui_unfollow') : localize(lang, 'com_ui_follow')}
          </button>
        )}
      </div>

      {/* User bio */}
      {/* {userId === user?.id ? (  // Check if the current user matches the profile user
        <div className="w-full rounded-lg p-6 dark:text-gray-200">
          {editMode ? (
            <form className="flex flex-col space-y-4" onSubmit={handleSubmit}>
              <div className="flex items-center">
                <label htmlFor="bio" className="flex items-center justify-center pl-5 pr-5">
                  <span className="text-lg">{localize(lang, 'com_ui_about_yourself')}</span>
                </label>
                <textarea
                  id="bio"
                  value={bio}
                  placeholder="分享一下你的兴趣、技能和人生态度..."
                  onChange={(e) => setBio(e.target.value)}
                  className="flex-1 border border-gray-300 bg-transparent p-2"
                ></textarea>
              </div>

              <div className="flex justify-end space-x-4">
                <button
                  type="button"
                  onClick={handleEditProfile}
                  className="rounded bg-gray-300 px-4 py-1 hover:bg-gray-500"
                >
                 Back
                </button>
                <button
                  type="submit"
                  className="rounded bg-green-500 px-4 py-1 text-white hover:bg-green-600"
                  onClick={handleSubmit}
                >
                 Save
                </button>
              </div>
            </form>
          ) : (
            <>
              {userId === user?.id && (
                <>
                  <div className="pl-7">{bio}</div>
                  <div className="flex flex-col md:flex-row md:items-start md:space-x-4">
                    <div className="ml-auto md:flex-none">
                      <p className="mt-4">
                        <button
                          className="flex w-24 flex-col items-center leading-[22px] text-gray-600 hover:text-black dark:text-gray-400 dark:hover:text-gray-200"
                          onClick={handleEditProfile}
                        >
                    编辑资料
                        </button>
                      </p>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="w-full rounded-lg p-6 dark:text-gray-200">
          <div className="pl-7">{bio}</div>
        </div>
      )} */}

      {userId === user?.id ? (
        // Current user's profile view
        <div className="w-full rounded-lg p-6 dark:text-gray-200">
          {editMode ? (
            // Edit mode
            <form className="flex flex-col space-y-4" onSubmit={handleSubmit}>
              <div className="flex items-center">
                <label htmlFor="bio" className="flex items-center justify-center pl-5 pr-5">
                  <span className="text-lg">{localize(lang, 'com_ui_about_yourself')}</span>
                </label>
                <textarea
                  id="bio"
                  value={bio}
                  placeholder="分享一下你的兴趣、技能和人生态度..."
                  onChange={(e) => setBio(e.target.value)}
                  className="flex-1 border border-gray-300 bg-transparent p-2"
                ></textarea>
              </div>

              <div className="flex justify-end space-x-4">
                <button
                  type="button"
                  onClick={handleEditProfile}
                  className="rounded bg-gray-300 px-4 py-1 hover:bg-gray-500"
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="rounded bg-green-500 px-4 py-1 text-white hover:bg-green-600"
                  onClick={handleSubmit}
                >
                  Save
                </button>
              </div>
            </form>
          ) : (
            // Profile view mode
            <>
              <div className="pl-7">{bio}</div>
              <div className="flex flex-col md:flex-row md:items-start md:space-x-4">
                <div className="ml-auto md:flex-none">
                  <p className="mt-4">
                    <button
                      className="flex w-24 flex-col items-center leading-[22px] text-gray-600 hover:text-black dark:text-gray-400 dark:hover:text-gray-200"
                      onClick={handleEditProfile}
                    >
                      <EditIcon />
                    </button>
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        // Other user's profile view
        <div className="w-full rounded-lg p-6 dark:text-gray-200">
          <div className="pl-7">{bio}</div>
        </div>
      )}

      {/*Tabs and tab content */}
      <div className="flex flex-col items-center">
        <Tabs
          value={tabValue}
          onValueChange={(value: string) => setTabValue(value)}
          className={defaultClasses}
        >
          <TabsList className="bg-white">
            {userId === user?.id && (
              <TabsTrigger value="likes" className="text-gray-500 dark:text-gray-200">
                {localize(lang, 'com_ui_my_likes')}
              </TabsTrigger>
            )}
            {userId != user?.id && (
              <TabsTrigger value="conversations" className="text-gray-500 dark:text-gray-200">
                {localize(lang, 'com_ui_conversations')}
              </TabsTrigger>
            )}
            <TabsTrigger value="followers" className="text-gray-500 dark:text-gray-200">
              {localize(lang, 'com_ui_followers')}
            </TabsTrigger>
            <TabsTrigger value="following" className="text-gray-500 dark:text-gray-200">
              {localize(lang, 'com_ui_following')}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="flex h-full flex-col overflow-y-auto border-t-2">
        {tabValue === 'likes' && <LikedConversations key={userId} />}
        {tabValue === 'conversations' && <PublicConversations key={userId} />}

        {/*New followers and follwings are added at the end of the object in MongoDB. */}
        {/*We reverse the array to dsiplay the most recent follwers and followings at the top. */}
        {tabValue === 'followers' && (
          <div>
            {Object.entries(profileUser ? profileUser.followers : {})
              .reverse()
              .map(([id, info]) => (
                <ListItem key={id} id={id} info={info} />
              ))}
          </div>
        )}
        {tabValue === 'following' && (
          <div>
            {Object.entries(profileUser ? profileUser.following : {})
              .reverse()
              .map(([id, info]) => (
                <ListItem key={id} id={id} info={info} />
              ))}
          </div>
        )}
        {tabValue === '' && <Spinner />}
      </div>
    </div>
  );
}

// To avoid internal state mixture
function Profile() {
  const { userId } = useParams();

  return <ProfileContent key={userId} />;
}

export default Profile;
