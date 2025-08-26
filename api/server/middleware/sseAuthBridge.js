// ~/server/middleware/sseAuthBridge.js
module.exports = function sseAuthBridge(req, _res, next) {
    try {
      const qToken = req.query.token;
      // If no Authorization header but a token in query, promote it
      if (qToken && !req.headers.authorization) {
        req.headers.authorization = `Bearer ${qToken}`;
      }
    } catch (_) {}
    next();
  };
  