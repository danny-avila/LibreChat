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

set -e

docker build -t ${LOCAL_DOCKER_IMG} .
