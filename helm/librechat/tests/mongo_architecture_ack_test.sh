#!/usr/bin/env bash
# Regression test for the mongodb.architecture / librechat.mongoArchitectureAck
# fail-fast guard in templates/configmap-env.yaml.
#
# Background: mongodb.architecture cannot be `required` directly — the bundled
# Bitnami subchart's own values.yaml already defaults it to "standalone", and
# Helm coalesces that subchart default in before any parent template renders,
# so .Values.mongodb.architecture is never nil to fail on. A post-install
# NOTES.txt warning alone doesn't make the admin panel's base-config editing
# feature available (a standalone MongoDB still 503s on every save), so the
# chart also fails the render itself until librechat.mongoArchitectureAck is
# set explicitly and matches mongodb.architecture — forcing every install and
# upgrade to make an informed choice instead of silently inheriting a
# non-functional default.
#
# This test asserts: (1) omitting the ack fails a fresh install's render, (2)
# setting the ack to a value that disagrees with mongodb.architecture fails a
# fresh install's render, (3) a matching standalone pair renders successfully,
# (4) a matching replicaset pair renders successfully, (5) an EXISTING release
# running `helm upgrade` (--is-upgrade) with the ack unset — the exact shape
# of every bundled-Mongo release created before this chart version — still
# renders successfully instead of being broken by a value it never had to
# set before.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHART_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if ! command -v helm >/dev/null 2>&1; then
  echo "FAIL: helm not on PATH" >&2
  exit 1
fi

render() {
  helm template librechat "${CHART_DIR}" --set "librechat.configEnv.PLACEHOLDER=1" "$@"
}

if render >/tmp/mongo-ack-unset.out 2>&1; then
  echo "FAIL: render should have failed with librechat.mongoArchitectureAck unset" >&2
  exit 1
fi
if ! grep -q "librechat.mongoArchitectureAck must be set explicitly" /tmp/mongo-ack-unset.out; then
  echo "FAIL: unset-ack error did not mention librechat.mongoArchitectureAck" >&2
  cat /tmp/mongo-ack-unset.out >&2
  exit 1
fi

if render --set mongodb.architecture=replicaset --set librechat.mongoArchitectureAck=standalone \
  >/tmp/mongo-ack-mismatch.out 2>&1; then
  echo "FAIL: render should have failed on a mongoArchitectureAck/architecture mismatch" >&2
  exit 1
fi
if ! grep -q "does not match mongodb.architecture" /tmp/mongo-ack-mismatch.out; then
  echo "FAIL: mismatch error did not mention the architecture mismatch" >&2
  cat /tmp/mongo-ack-mismatch.out >&2
  exit 1
fi

if ! render --set mongodb.architecture=standalone --set librechat.mongoArchitectureAck=standalone \
  >/tmp/mongo-ack-standalone.out 2>&1; then
  echo "FAIL: a matching standalone/standalone pair should render successfully" >&2
  cat /tmp/mongo-ack-standalone.out >&2
  exit 1
fi

if ! render --set mongodb.architecture=replicaset --set librechat.mongoArchitectureAck=replicaset \
  >/tmp/mongo-ack-replicaset.out 2>&1; then
  echo "FAIL: a matching replicaset/replicaset pair should render successfully" >&2
  cat /tmp/mongo-ack-replicaset.out >&2
  exit 1
fi

if ! render --is-upgrade >/tmp/mongo-ack-upgrade-unset.out 2>&1; then
  echo "FAIL: an existing release running helm upgrade with the ack unset must not break — this is the exact shape of every bundled-Mongo release created before this chart version" >&2
  cat /tmp/mongo-ack-upgrade-unset.out >&2
  exit 1
fi
if ! grep -q '^  MONGO_URI:' /tmp/mongo-ack-upgrade-unset.out; then
  echo "FAIL: upgrade render succeeded but did not produce a MONGO_URI" >&2
  cat /tmp/mongo-ack-upgrade-unset.out >&2
  exit 1
fi

echo "PASS: mongoArchitectureAck fail-fast guard enforces an explicit, matching choice on fresh installs without breaking existing upgrades"
