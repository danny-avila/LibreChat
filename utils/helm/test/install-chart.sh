#!/bin/bash
[ "$1" = -x ] && shift && set -x
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "${DIR}"/../chart || exit 1

helm dependency update

cd ../

helm install librechat ./chart -f ./chart/values.yaml -f ./test/values-test.yaml

echo 'Libre chat is running on http://localhost:8081/'
