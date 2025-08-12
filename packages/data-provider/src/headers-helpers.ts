import axios from 'axios';

export function setAcceptLanguageHeader(value: string): void {
  axios.defaults.headers.common['Accept-Language'] = value;
}

export function setTokenHeader(token: string) {
  axios.defaults.headers.common['Authorization'] = 'Bearer ' + token;
}

// TODO make this configurable
function setConfigurableHeader(): void {
  axios.defaults.headers.common['X-Requested-With'] = 'fetch';
}

// Initialize the configurable header
setConfigurableHeader();
