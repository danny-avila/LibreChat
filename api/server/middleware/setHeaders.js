function setHeaders(req, res, next) {
  // Skip SSE headers for resumable mode - it returns JSON first, then client subscribes separately
  if (req.query.resumable === 'true') {
    return next();
  }

  res.writeHead(200, {
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no',
  });
  next();
}

module.exports = setHeaders;
