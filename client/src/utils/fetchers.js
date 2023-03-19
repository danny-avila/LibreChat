/* eslint-disable react-hooks/rules-of-hooks */
import axios from 'axios';
import useSWR from 'swr';
import useSWRMutation from 'swr/mutation';

const fetcher = (url) => fetch(url, { credentials: 'include' }).then((res) => res.json());
const axiosFetcher = async (url, params) => {
  console.log(params, 'params');
  return axios.get(url, params);
};

const postRequest = async (url, { arg }) => {
  return await axios.post(url, { withCredentials: true, arg });
};

export const searchFetcher = async (pre, q, pageNumber, callback) => {
  pre();
  const { data } = await axios.get(`/api/search?q=${q}&pageNumber=${pageNumber}`);
  console.log('search data', data);
  callback(data);
};

export const fetchById = async (path, conversationId) => {
  return await axios.get(`/api/${path}/${conversationId}`);
  // console.log(`fetch ${path} data`, data);
  // callback(data);
};

export const swr = (path, successCallback, options) => {
  const _options = { ...options };

  if (successCallback) {
    _options.onSuccess = successCallback;
  }

  return useSWR(path, fetcher, _options);
};

export default function manualSWR(path, type, successCallback) {
  const options = {};

  if (successCallback) {
    options.onSuccess = successCallback;
  }
  const fetchFunction = type === 'get' ? fetcher : postRequest;
  return useSWRMutation(path, fetchFunction, options);
}

export function useManualSWR({ path, params, type, onSuccess }) {
  const options = {};

  if (onSuccess) {
    options.onSuccess = onSuccess;
  }

  console.log(params, 'params');

  const fetchFunction = type === 'get' ? _.partialRight(axiosFetcher, params) : postRequest;
  return useSWRMutation(path, fetchFunction, options);
}
