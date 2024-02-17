/**
 *
 * @param {TCustomConfig['rateLimits'] | undefined} rateLimits
 */
const handleRateLimits = (rateLimits) => {
  if (!rateLimits) {
    return;
  }
  const { fileUploads } = rateLimits;
  if (!fileUploads) {
    return;
  }

  process.env.FILE_UPLOAD_IP_MAX = fileUploads.ipMax ?? process.env.FILE_UPLOAD_IP_MAX;
  process.env.FILE_UPLOAD_IP_WINDOW =
    fileUploads.ipWindowInMinutes ?? process.env.FILE_UPLOAD_IP_WINDOW;
  process.env.FILE_UPLOAD_USER_MAX = fileUploads.userMax ?? process.env.FILE_UPLOAD_USER_MAX;
  process.env.FILE_UPLOAD_USER_WINDOW =
    fileUploads.userWindowInMinutes ?? process.env.FILE_UPLOAD_USER_WINDOW;
};

module.exports = handleRateLimits;
