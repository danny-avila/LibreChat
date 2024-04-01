#!/bin/bash
[ "$1" = -x ] && shift && set -x
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "${DIR}"/../chart

helm dependency update

helm install librechat-test . -f ./values.yaml -f ../test/values-test.yaml

helm upgrade --debug librechat-test . -f ./values.yaml -f ../test/values-test.yaml
