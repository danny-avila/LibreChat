#!/bin/bash
[ "$1" = -x ] && shift && set -x
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd ${DIR}/../..

TAG=$1

if [[ -z "${TAG}" ]]; then
  TAG=${LIBRE_CHAT_DOCKER_TAG}
fi

if [[ -z "${TAG}" ]]; then
  TAG=latest
fi

LOCAL_DOCKER_IMG=librechat:${TAG}

if [[ -z "${DOCKER_REMOTE_REGISTRY}" ]]; then
  echo "DOCKER_REMOTE_REGISTRY is not set" >&2

  exit 1
fi

REMOTE_DOCKER_IMG=${DOCKER_REMOTE_REGISTRY}/${LOCAL_DOCKER_IMG}

set -e

docker tag ${LOCAL_DOCKER_IMG} ${REMOTE_DOCKER_IMG}

docker push ${REMOTE_DOCKER_IMG}
