/**
 *
 * @param {TCustomConfig['rateLimits'] | undefined} rateLimits
 */
const handleRateLimits = (rateLimits) => {
  if (!rateLimits) {
    return;
  }
  const { fileUploads, conversationsImport } = rateLimits;
  if (fileUploads) {
    process.env.FILE_UPLOAD_IP_MAX = fileUploads.ipMax ?? process.env.FILE_UPLOAD_IP_MAX;
    process.env.FILE_UPLOAD_IP_WINDOW =
      fileUploads.ipWindowInMinutes ?? process.env.FILE_UPLOAD_IP_WINDOW;
    process.env.FILE_UPLOAD_USER_MAX = fileUploads.userMax ?? process.env.FILE_UPLOAD_USER_MAX;
    process.env.FILE_UPLOAD_USER_WINDOW =
      fileUploads.userWindowInMinutes ?? process.env.FILE_UPLOAD_USER_WINDOW;
  }

  if (conversationsImport) {
    process.env.IMPORT_IP_MAX = conversationsImport.ipMax ?? process.env.IMPORT_IP_MAX;
    process.env.IMPORT_IP_WINDOW =
      conversationsImport.ipWindowInMinutes ?? process.env.IMPORT_IP_WINDOW;
    process.env.IMPORT_USER_MAX = conversationsImport.userMax ?? process.env.IMPORT_USER_MAX;
    process.env.IMPORT_USER_WINDOW =
      conversationsImport.userWindowInMinutes ?? process.env.IMPORT_USER_WINDOW;
  }
};

module.exports = handleRateLimits;
