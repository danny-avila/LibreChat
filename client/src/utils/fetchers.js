/* eslint-disable react-hooks/rules-of-hooks */
import axios from 'axios';
import useSWR from 'swr';
import useSWRMutation from 'swr/mutation';

const fetcher = (url) => fetch(url, {credentials: 'include'}).then((res) => res.json());

const postRequest = async (url, { arg }) => {
  return await axios.post(url, { withCredentials: true, arg });
};

export const swr = (path, successCallback, options) => {
  const _options = {...options};

  if (successCallback) {
    _options.onSuccess = successCallback;
  }

  return useSWR(path, fetcher, _options);
}

export default function manualSWR(path, type, successCallback) {
  const options = {};

  if (successCallback) {
    options.onSuccess = successCallback;
  }
  const fetchFunction = type === 'get' ? fetcher : postRequest;
  return useSWRMutation(path, fetchFunction, options);
}
