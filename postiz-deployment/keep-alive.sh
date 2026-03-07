#!/bin/bash
# Keep-Alive script: pings Postiz periodically to prevent idle timeouts (504 after idle).
# Run from cron every 1–2 minutes, or run in background: nohup ./keep-alive.sh >> keep-alive.log 2>&1 &

POSTIZ_URL="${POSTIZ_URL:-https://postiz.cloud.jamot.pro}"
INTERVAL="${KEEP_ALIVE_INTERVAL:-90}"
CURL_TIMEOUT=15

# Single ping (for cron: run every minute)
ping_once() {
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$CURL_TIMEOUT" "$POSTIZ_URL" 2>/dev/null)
    if [ "$code" = "200" ] || [ "$code" = "302" ] || [ "$code" = "301" ]; then
        echo "[$(date -Iseconds)] OK (HTTP $code)"
        return 0
    else
        echo "[$(date -Iseconds)] FAIL (HTTP $code)"
        return 1
    fi
}

# If first arg is "once", run once and exit (for cron)
if [ "${1:-}" = "once" ]; then
    ping_once
    exit $?
fi

# Otherwise run in a loop every INTERVAL seconds
echo "[$(date -Iseconds)] Keep-alive started: $POSTIZ_URL every ${INTERVAL}s"
while true; do
    ping_once
    sleep "$INTERVAL"
done
