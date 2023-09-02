function checkExpiry(expiresAt, message) {
  const expiresAtDate = new Date(expiresAt);
  if (expiresAtDate < new Date()) {
    const expiryStr = `User-provided key expired at ${expiresAtDate.toLocaleString()}`;
    const errorMessage = message ? `${message}\n${expiryStr}` : expiryStr;
    throw new Error(errorMessage);
  }
}

module.exports = checkExpiry;
