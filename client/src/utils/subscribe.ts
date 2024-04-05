import axios from 'axios';

export const topupSubscribeAction = () => {
  axios({
    method: 'post',
    url: '/api/subscribe/topup',
    data: {
      callback: location.pathname,
    },
    withCredentials: true,
  })
    .then((res) => {
      const session = res.data.session;
      window.location.href = session.url;
    })
    .catch((err) => {
      console.error(err);
    });
};
