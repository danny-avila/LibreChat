import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import Conversation from './Conversation';
// import { swr } from '~/utils/fetchers';
import useDidMountEffect from '~/hooks/useDidMountEffect';

export default function Conversations() {
  const [isHovering, setIsHovering] = useState(false);
  const { conversationId } = useSelector((state) => state.convo);
  // useDidMountEffect(() => mutate(), [conversationId]);
  // const currentRef = useRef(null);

  // const scrollToTop = () => {
  //   currentRef.current?.scrollIntoView({ behavior: 'smooth' });
  // };

  // // this useEffect triggers the following warning in the Messages component (but not here):
  // // Warning: Internal React error: Expected static flag was missing.
  // useEffect(() => {
  //   scrollToTop();
  // }, [conversationId]);

  return (
    <div
      className={`-mr-2 flex-1 flex-col overflow-y-auto ${
        isHovering ? '' : 'scrollbar-transparent'
      } border-b border-white/20`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <div className="flex flex-col gap-2 text-sm text-gray-100">
        {/* <div ref={currentRef} /> */}
        {conversations &&
          conversations.map((convo, i) => (
            <Conversation
              key={convo.conversationId}
              id={convo.conversationId}
              parentMessageId={convo.parentMessageId}
              title={convo.title}
              conversationId={conversationId}
            />
          ))}
        {conversations && conversations.length >= 12 && (
          <button className="btn btn-dark btn-small m-auto mb-2 flex justify-center gap-2">
            Show more
          </button>
        )}
      </div>
    </div>
  );
}
