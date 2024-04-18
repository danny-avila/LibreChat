import React, { useEffect, useMemo, useState } from 'react';
import { TConversation, request } from 'librechat-data-provider';
import Room from './Room';
import { useRecoilValue } from 'recoil';
import {
  useConversationsInfiniteQuery,
  useRoomsInfiniteQuery,
  useSearchInfiniteQuery,
} from '~/data-provider';
import { useAuthContext } from '~/hooks';
import store from '~/store';

export default function Rooms({
  toggleNav,
  moveToTop,
}: {
  moveToTop: () => void;
  toggleNav: () => void;
}) {
  const [rooms, setRooms] = useState<{ owned: TConversation[]; joined: TConversation[] }>({
    owned: [],
    joined: [],
  });
  // const { isAuthenticated } = useAuthContext();
  // const [pageNumber, setPageNumber] = useState(1);
  // const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useRoomsInfiniteQuery(
  //   { pageNumber: pageNumber.toString() },
  //   { enabled: isAuthenticated },
  // );

  // const searchQuery = useRecoilValue(store.searchQuery);
  // const searchQueryRes = useSearchInfiniteQuery(
  //   { pageNumber: pageNumber.toString(), searchQuery: searchQuery },
  //   { enabled: isAuthenticated && !!searchQuery.length },
  // );

  // const conversations = useMemo(
  //   () =>
  //     (searchQuery ? searchQueryRes?.data : data)?.pages.flatMap((page) => page.conversations) ||
  //     [],
  //   [data, searchQuery, searchQueryRes?.data],
  // );
  // console.log('=== data in rooms ===', data);

  useEffect(() => {
    console.log('=== fetching rooms ===');
    request
      .get('/api/rooms')
      .then((res) => setRooms(res))
      .catch((error) => console.error(error));
  }, []);

  return (
    <div className="text-token-text-primary flex flex-col gap-2 pb-2 text-sm">
      <div>
        <div>
          <span>
            {Object.keys(rooms).map((i) => (
              <div key={i}>
                {/* <div
                  style={{
                    color: '#aaa',
                    fontSize: '0.7rem',
                    marginTop: '20px',
                    marginBottom: '5px',
                    paddingLeft: '10px',
                  }}
                >
                  Your Rooms - {rooms[i].length}
                </div> */}
                {rooms[i].map((room) => (
                  <Room
                    key={`${room.conversationId}-${room}`}
                    // isLatestConvo={room.conversationId === firstTodayConvoId}
                    room={room}
                    retainView={moveToTop}
                    toggleNav={toggleNav}
                  />
                ))}
                <div
                  style={{
                    marginTop: '5px',
                    marginBottom: '5px',
                  }}
                />
              </div>
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}
