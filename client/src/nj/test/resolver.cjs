/**
 * Makes it possible to import vite files that use `?raw` suffix.
 */
module.exports = (request, options) =>
  options.defaultResolver(request.replace(/\?raw$/, ''), options);
