import React, { useEffect, useState } from 'react';
import { TRoom, request } from 'librechat-data-provider';
import Room from './Room';

export default function Rooms({
  toggleNav,
  moveToTop,
}: {
  moveToTop: () => void;
  toggleNav: () => void;
}) {
  const [rooms, setRooms] = useState<{ created: TRoom[]; joined: TRoom[] }>({
    created: [],
    joined: [],
  });
  useEffect(() => {
    request
      .get('/api/rooms')
      .then((res: any) => setRooms({ created: res[0], joined: res[1] }))
      .catch((error) => console.error(error));
  }, []);

  return (
    <div className="text-token-text-primary flex flex-col gap-2 pb-2 text-sm">
      <div>
        <div>
          <span>
            {Object.keys(rooms).map((cat) => (
              <div key={cat}>
                <div
                  style={{
                    color: '#aaa',
                    fontSize: '0.7rem',
                    marginTop: '20px',
                    marginBottom: '5px',
                    paddingLeft: '10px',
                  }}
                >
                  Your Rooms - {rooms[cat].length}
                </div>
                {rooms[cat].map((room) => (
                  <Room
                    key={`${cat}-${room.conversationId}-${room}`}
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
