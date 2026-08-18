#!/usr/bin/env bash
#
# Installs Playwright's optional font packages for the `chrome` channel.
#
# The GitHub runner ships Chrome as an apt package, so every library Playwright
# lists is already satisfied by apt itself. The only packages `install-deps` adds
# are decorative CJK/Thai/Cyrillic fonts (~21MB) that no CI assertion depends on:
# the one spec that takes screenshots gates the comparison behind
# `E2E_VISUAL_SNAPSHOTS`, which CI never sets.
#
# Ubuntu's mirrors stall often enough that a hard failure here has repeatedly
# taken down whole e2e runs, so each attempt is capped and a final failure is
# only a warning. The workflow keeps `continue-on-error: true` as a backstop for
# the case where the step itself is killed by its timeout.

set -uo pipefail

readonly ATTEMPT_TIMEOUT_SECONDS=70
readonly MAX_ATTEMPTS=3
readonly LOCK_WAIT_ATTEMPTS=60

# `timeout` kills npx, but the apt-get it started keeps running as root and holds the
# dpkg frontend lock. Steps that install packages after this one are fatal, so wait for
# the orphan to finish rather than handing it a lock they cannot take.
wait_for_dpkg_lock() {
  for _ in $(seq 1 "${LOCK_WAIT_ATTEMPTS}"); do
    sudo fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 || return 0
    sleep 2
  done
  echo "::warning::dpkg frontend lock is still held; a later apt step may fail"
}

for attempt in $(seq 1 "${MAX_ATTEMPTS}"); do
  if timeout "${ATTEMPT_TIMEOUT_SECONDS}" npx playwright install-deps chrome; then
    exit 0
  fi
  echo "::warning::playwright install-deps attempt ${attempt}/${MAX_ATTEMPTS} failed or timed out"
  wait_for_dpkg_lock
  sleep 5
done

echo "::warning::Optional Playwright font packages were not installed; continuing without them."
wait_for_dpkg_lock
exit 0
