import React, { useEffect, useState } from 'react';
import { TConversation, request } from 'librechat-data-provider';
import Room from './Room';

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

  useEffect(() => {
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
                <div
                  style={{
                    color: '#aaa',
                    fontSize: '0.7rem',
                    marginTop: '20px',
                    marginBottom: '5px',
                    paddingLeft: '10px',
                  }}
                >
                  Your Rooms - {rooms[i].length}
                </div>
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
