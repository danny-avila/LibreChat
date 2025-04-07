import { useQueryClient } from '@tanstack/react-query';
import type { TMessage } from 'librechat-data-provider';
import { Constants, QueryKeys } from 'librechat-data-provider';
import type { Dispatch, SetStateAction } from 'react';
import { useRecoilValue } from 'recoil';
import { useLocalize, useNewConvo } from '~/hooks';
import store from '~/store';
export default function MobileNav({
  setNavVisible,
}: {
  setNavVisible: Dispatch<SetStateAction<boolean>>;
}) {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { newConversation } = useNewConvo();
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const { title = 'New Chat' } = conversation || {};

  return (
    <div className="bg-token-main-surface-primary sticky top-0 z-10 flex min-h-[40px] items-center justify-center bg-white pl-1 dark:bg-gray-800 dark:text-white md:hidden">
      <button
        type="button"
        data-testid="mobile-header-new-chat-button"
        aria-label={localize('com_nav_open_sidebar')}
        className="m-1 inline-flex size-10 items-center justify-center rounded-full hover:bg-surface-hover"
        onClick={() =>
          setNavVisible((prev) => {
            localStorage.setItem('navVisible', JSON.stringify(!prev));
            return !prev;
          })
        }
      >
        <span className="sr-only">{localize('com_nav_open_sidebar')}</span>
        <svg
          width="24"
          height="24"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="icon-md"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M3 8C3 7.44772 3.44772 7 4 7H20C20.5523 7 21 7.44772 21 8C21 8.55228 20.5523 9 20 9H4C3.44772 9 3 8.55228 3 8ZM3 16C3 15.4477 3.44772 15 4 15H14C14.5523 15 15 15.4477 15 16C15 16.5523 14.5523 17 14 17H4C3.44772 17 3 16.5523 3 16Z"
            fill="currentColor"
          />
        </svg>
      </button>
      <h1 className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-center text-sm font-normal">
        {title ?? localize('com_ui_new_chat')}
      </h1>
      <button
        type="button"
        aria-label={localize('com_ui_new_chat')}
        className="m-1 inline-flex size-10 items-center justify-center rounded-full hover:bg-surface-hover"
        onClick={() => {
          queryClient.setQueryData<TMessage[]>(
            [QueryKeys.messages, conversation?.conversationId ?? Constants.NEW_CONVO],
            [],
          );
          newConversation();
        }}
      >

      <svg xmlns="http://www.w3.org/2000/svg" 
        width="20"
          height="20"
      viewBox="55.96 40.94 67.99 68.02" fill="currentColor">
      <path d="M86.748 41.125c1.937-.181 3.834-.247 5.777-.117q.827.053 1.65.146.823.094 1.641.228.818.135 1.628.31.81.175 1.61.391.8.216 1.588.471.789.255 1.563.549.775.294 1.534.627.759.332 1.501.702.741.37 1.464.776.722.406 1.423.848.701.442 1.379.918.678.476 1.332.986.653.509 1.281 1.051.627.541 1.226 1.114.6.572 1.17 1.174.57.601 1.11 1.23c6.12 7.037 8.867 16.143 8.234 25.384q-.062.825-.164 1.647-.102.821-.245 1.637-.143.815-.325 1.623-.183.807-.406 1.604-.223.797-.484 1.582-.262.785-.562 1.556-.301.771-.639 1.527-.338.756-.713 1.493-.375.738-.786 1.456-.411.719-.857 1.416-.446.697-.926 1.372-.48.674-.992 1.324-.513.65-1.057 1.273-.544.624-1.119 1.219-.574.596-1.177 1.163-.604.567-1.234 1.103c-7.058 6.118-16.012 8.623-25.237 7.949-4.652-.457-8.767-1.878-13.063-3.631-4.451 1.317-10.597 4.689-15.248 3.135-.894-.299-1.606-.85-2.012-1.713-1.674-3.564 1.893-12.053 3.179-15.776-2.072-3.812-3.251-8.302-3.672-12.606-.852-8.722 1.684-17.93 7.294-24.715 5.919-7.158 14.086-11.544 23.332-12.428zm-21.387 49.67c-1.059 4.538-2.518 9.17-4.551 13.372 4.214-1.9 8.912-3.355 13.355-4.63 3.302 1.275 6.781 3.073 10.277 3.651 7.374 1.351 15.363-.106 21.553-4.387 6.325-4.374 10.857-10.893 12.225-18.515 1.349-7.518-.394-15.727-4.791-21.975q-.41-.576-.847-1.131-.437-.555-.901-1.088-.464-.533-.954-1.043-.49-.51-1.004-.995-.514-.485-1.052-.944-.537-.459-1.097-.891-.559-.432-1.139-.836-.58-.404-1.179-.779-.599-.375-1.216-.72-.617-.345-1.25-.66-.633-.315-1.28-.597-.648-.283-1.309-.534-.661-.251-1.333-.469-.672-.218-1.355-.403-.682-.185-1.373-.335-.691-.151-1.388-.268c-2.17-.373-4.492-.512-6.682-.264-7.516.561-14.694 3.89-19.648 9.644-5.263 6.115-7.674 13.635-7.05 21.686.38 4.91 2.581 8.562 3.988 13.112zm23.652-32.129l.74.072c.705.119 1.357.439 1.771 1.036 1.719 2.478 1.143 8.621.65 11.47 2.91-.03 10.392-.887 12.648 1.115.073.168.223.407.219.587-.015.641-.47 1.261-.932 1.669-2.446 2.157-8.876 1.415-12.037 1.251.062.526.095 1.05.125 1.579.185 3.293 1.044 8.465-1.308 11.098l-.328-.008c-.779-.042-1.468-.293-1.985-.899-2.037-2.388-1.024-8.715-.741-11.685-2.917.108-10.274.71-12.506-1.287-.438-.392-.538-.668-.584-1.237.17-.425.444-.678.808-.94 2.777-2.005 9.044-1.529 12.257-.994q-.016-.166-.029-.332c-.285-3.433-1.084-9.75 1.235-12.494z"/>
      </svg>
        {/* <CirclePlusIcon className="icon-md" /> */}
        {/* <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="icon-md"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M16.7929 2.79289C18.0118 1.57394 19.9882 1.57394 21.2071 2.79289C22.4261 4.01184 22.4261 5.98815 21.2071 7.20711L12.7071 15.7071C12.5196 15.8946 12.2652 16 12 16H9C8.44772 16 8 15.5523 8 15V12C8 11.7348 8.10536 11.4804 8.29289 11.2929L16.7929 2.79289ZM19.7929 4.20711C19.355 3.7692 18.645 3.7692 18.2071 4.2071L10 12.4142V14H11.5858L19.7929 5.79289C20.2308 5.35499 20.2308 4.64501 19.7929 4.20711ZM6 5C5.44772 5 5 5.44771 5 6V18C5 18.5523 5.44772 19 6 19H18C18.5523 19 19 18.5523 19 18V14C19 13.4477 19.4477 13 20 13C20.5523 13 21 13.4477 21 14V18C21 19.6569 19.6569 21 18 21H6C4.34315 21 3 19.6569 3 18V6C3 4.34314 4.34315 3 6 3H10C10.5523 3 11 3.44771 11 4C11 4.55228 10.5523 5 10 5H6Z"
            fill="currentColor"
          />
        </svg> */}
      </button>
    </div>
  );
}
