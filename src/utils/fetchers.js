import axios from 'axios';
import useSWR from 'swr';
import useSWRMutation from 'swr/mutation';

const fetcher = (url) => fetch(url).then((res) => res.json());

const postRequest = async (url, { arg }) => {
  return await axios.post(url, { arg });
};

export const swr = (path) => useSWR(path, fetcher);

export default function manualSWR(path, type, successCallback) {
  const fetchFunction = type === 'get' ? fetcher : postRequest;
  return useSWRMutation(path, fetchFunction, {
    onSuccess: successCallback
  });
};
