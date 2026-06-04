const SSE_HEARTBEAT_INTERVAL_MS = 15000;
const SSE_HEARTBEAT_PAYLOAD = ': heartbeat\n\n';

function writeSseHeartbeat(res) {
  if (res.writableEnded || res.destroyed) {
    return false;
  }

  res.write(SSE_HEARTBEAT_PAYLOAD);
  if (typeof res.flush === 'function') {
    res.flush();
  }

  return true;
}

function startSseHeartbeat(res, intervalMs = SSE_HEARTBEAT_INTERVAL_MS) {
  const heartbeat = setInterval(() => {
    if (!writeSseHeartbeat(res)) {
      clearInterval(heartbeat);
    }
  }, intervalMs);

  if (typeof heartbeat.unref === 'function') {
    heartbeat.unref();
  }

  const stopHeartbeat = () => clearInterval(heartbeat);
  res.once('finish', stopHeartbeat);
  res.once('close', stopHeartbeat);

  return stopHeartbeat;
}

module.exports = {
  SSE_HEARTBEAT_INTERVAL_MS,
  SSE_HEARTBEAT_PAYLOAD,
  startSseHeartbeat,
  writeSseHeartbeat,
};
