#!/bin/bash
[ "$1" = -x ] && shift && set -x
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

kubectl apply -f "${DIR}"/fake-store.yaml

kubectl get SecretStores,ClusterSecretStores,ExternalSecrets --all-namespaces
