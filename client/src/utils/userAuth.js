import axios from 'axios';

export default async function fetchData() {
  try {
    const response = await axios.get('/api/me', {
      timeout: 1000,
      withCredentials: true
    });
    const user = response.data;
    if (user) {
      // dispatch(setUser(user));
      // callback(user);
      return user;
    } else {
      console.log('Not login!');
      window.location.href = '/auth/login';
    }
  } catch (error) {
    console.error(error);
    console.log('Not login!');
    window.location.href = '/auth/login';
  }
}