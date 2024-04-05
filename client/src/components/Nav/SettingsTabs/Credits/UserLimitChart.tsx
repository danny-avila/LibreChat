import axios from 'axios';
import React, { useEffect } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';

// import { Flat } from '@alptugidin/react-circular-progress-bar';

import store from '~/store';

export default function UserLimitChart() {
  const user = useRecoilValue(store.user);
  const setUser = useSetRecoilState(store.user);

  useEffect(() => {
    axios({
      method: 'GET',
      url: '/api/credits',
      withCredentials: true,
    })
      .then((res) => {
        setUser(user ? { ...user, credits: res.data.credits } : undefined);
      })
      .catch((err) => console.error(err));
  }, []);

  return (
    <div className="inline-block w-1/2">
      <p>
        <b>Your Credits:</b> {user?.credits ?? 0}
      </p>
    </div>
  );
}
