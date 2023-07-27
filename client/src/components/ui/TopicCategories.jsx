import React from 'react';
import { useRecoilState, useSetRecoilState } from 'recoil';
import store from '~/store';
import { useMessageHandler } from '../../utils/handleSubmit';
import { useAuthContext } from '../../hooks/AuthContext';

const TopicCategories = ({ convoArray }) => {
  const { ask } = useMessageHandler();
  const { token } = useAuthContext();
  const setMessages = useSetRecoilState(store.messages);

  //CONST//
  //示例展示//
  const example1 = '中国古代的丝绸之路对世界交流有何影响？它在历史上的作用是怎样的？';
  const example2 = '人工智能技术的发展是否会对未来的就业形势产生影响？';
  const example3 = '中国电影产业发展如何？有哪些著名的中国电影作品？';
  //局限性//
  const limit1 = '可能偶尔生成不正确的信息';
  const limit2 = '可能偶尔会产生有害的指令或带有偏见的内容';
  const limit3 = '对于2021年之后的世界和事件知识有限';
  /* eslint-disable no-unused-vars */
  const [text, setText] = useRecoilState(store.text);
  const [conversation, setConversation] = useRecoilState(store.conversation);
  const convos = convoArray;
  const titles = convos.map((convo) => convo.title);

  const truncateText = (text, maxLength) => {
    if (text.length > maxLength) {
      return text.slice(0, maxLength) + '...';
    }
    return text;
  };

  const handleClick = (text) => {
    console.log(text);
    const clickedText = text;
    ask({ text: clickedText }); // Call the ask function with the clicked text
    setText('');
  };

  const handleHottestConvo = async (idx) => {
    //fetch the convoId that is clicked
    const convo_id = convoArray[idx].conversationId;
    // Fetch conversation data and messages based on the convoID
    try {
      // Fetch conversation data
      const response = await fetch(`/api/convos/${convo_id}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch conversation data');
      }
      const conversationData = await response.json();
      setConversation(conversationData);

      // Fetch messages for the conversation
      const messagesResponse = await fetch(`/api/messages/${convo_id}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      if (!messagesResponse.ok) {
        throw new Error('Failed to fetch messages');
      }
      const messagesData = await messagesResponse.json();
      setMessages(messagesData);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div>
      <div className="item-start gap-3.5 text-center md:flex">
        <div className="mb-8 flex flex-1 flex-col gap-3.5 md:mb-auto">
          <h2 className="m-auto flex items-center gap-3 text-lg font-normal md:flex-col md:gap-2">
            最新话题
          </h2>
          <ul className="m-auto flex w-full flex-col gap-3.5 sm:max-w-md">
            <button
              className="w-full rounded-md bg-gray-50 p-3 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-gray-900"
              style={{ cursor: 'default' }}
            >
              1
            </button>
            <button
              className="w-full rounded-md bg-gray-50 p-3 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-gray-900"
              style={{ cursor: 'default' }}
            >
              2
            </button>
            <button
              className="w-full rounded-md bg-gray-50 p-3 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-gray-900"
              style={{ cursor: 'default' }}
            >
              3
            </button>
          </ul>
        </div>
        <div className="mb-8 flex flex-1 flex-col gap-3.5 md:mb-auto">
          <h2 className="m-auto flex items-center gap-3 text-lg font-normal md:flex-col md:gap-2">
            热门趋势
          </h2>
          <ul className="m-auto flex w-full flex-col gap-3.5 sm:max-w-md">
            {titles.map((title, index) => {
              return (
                <button
                  key={index}
                  className="w-full rounded-md bg-gray-50 p-3 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-gray-900"
                  style={{ cursor: 'default' }}
                  onClick={() => handleHottestConvo(index)}
                >
                  {truncateText(title, 50)}
                </button>
              );
            })}
          </ul>
        </div>
        <div className="mb-8 flex flex-1 flex-col gap-3.5 md:mb-auto">
          <h2 className="m-auto flex items-center gap-3 text-lg font-normal md:flex-col md:gap-2">
            示例展示
          </h2>
          <ul className="m-auto flex w-full flex-col gap-3.5 sm:max-w-md">
            <button
              className="w-full rounded-md bg-gray-50 p-3 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-gray-900"
              style={{ cursor: 'default' }}
              onClick={() => handleClick(example1)}
            >
              {example1}
            </button>
            <button
              className="w-full rounded-md bg-gray-50 p-3 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-gray-900"
              style={{ cursor: 'default' }}
              onClick={() => handleClick(example2)}
            >
              {example2}
            </button>
            <button
              className="w-full rounded-md bg-gray-50 p-3 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-gray-900"
              style={{ cursor: 'default' }}
              onClick={() => handleClick(example3)}
            >
              {example3}
            </button>
          </ul>
        </div>
        <div className="mb-8 flex flex-1 flex-col gap-3.5 md:mb-auto">
          <h2 className="m-auto flex items-center gap-3 text-lg font-normal md:flex-col md:gap-2">
            局限性
          </h2>
          <ul className="m-auto flex w-full flex-col gap-3.5 sm:max-w-md">
            <button
              className="w-full rounded-md bg-gray-50 p-3 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-gray-900"
              style={{ cursor: 'default' }}
            >
              {limit1}
            </button>
            <button
              className="w-full rounded-md bg-gray-50 p-3 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-gray-900"
              style={{ cursor: 'default' }}
            >
              {limit2}
            </button>
            <button
              className="w-full rounded-md bg-gray-50 p-3 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-gray-900"
              style={{ cursor: 'default' }}
            >
              {limit3}
            </button>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default TopicCategories;
