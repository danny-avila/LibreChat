// Axios configuration for microfrontend cross-origin requests
import axios from 'axios';

// Configure axios to send cookies with all requests
axios.defaults.withCredentials = true;

// Add headers to indicate we expect to receive cookies
axios.defaults.headers.common['Accept'] = 'application/json';
axios.defaults.headers.common['Content-Type'] = 'application/json';

export default axios;