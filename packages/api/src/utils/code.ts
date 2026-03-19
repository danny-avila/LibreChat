import http from 'http';
import https from 'https';

/**
 * Dedicated agents for code-server requests, preventing socket pool contamination.
 * follow-redirects (used by axios) leaks `socket.destroy` as a timeout listener;
 * on Node 19+ (keepAlive: true by default), tainted sockets re-enter the global pool
 * and kill unrelated requests (e.g., node-fetch in CodeExecutor) after the idle timeout.
 */
export const codeServerHttpAgent = new http.Agent({ keepAlive: false });
export const codeServerHttpsAgent = new https.Agent({ keepAlive: false });
