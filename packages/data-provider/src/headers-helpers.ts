import axios from 'axios';

export function setAcceptLanguageHeader(value: string): void {
  axios.defaults.headers.common['Accept-Language'] = value;
}

export function setTokenHeader(token: string) {
  axios.defaults.headers.common['Authorization'] = 'Bearer ' + token;
}

// Set configurable custom header globally for all requests
function setConfigurableHeader(): void {
  const headerName = process.env.CUSTOM_HEADER_NAME;
  const headerValue = process.env.CUSTOM_HEADER_VALUE;
  if (headerName && headerValue) {
    axios.defaults.headers.common[headerName] = headerValue;
  }
}

// Initialize the configurable header
setConfigurableHeader();
