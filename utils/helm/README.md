# LibreChat Helm Chart

## Local Development

For local development we are using k3d to create a local kubernetes cluster.

More info about k3d: https://k3d.io/

### Prerequisites

Install k3d:

```bash
curl -s https://raw.githubusercontent.com/rancher/k3d/main/install.sh | bash
```

Create a k3d cluster with local port forwarding:

```bash
k3d cluster create librechat -p "8081:80@loadbalancer"
```

Install the external secret operator:

```bash
kubectl apply -k "https://github.com/external-secrets/external-secrets//config/crds/bases?ref=v0.9.11"
```

Check for newer version: https://external-secrets.io/latest/introduction/getting-started/

Install the fake secret store:

```bash
./utils/helm/test/load-fake-store.sh
```

### Install LibreChat Helm Chart

```bash
cd ./utils/helm/chart

helm dependency update

cd ../

helm install librechat ./chart -f ./chart/values.yaml -f ./test/values-test.yaml
```

Or you can use the script:

```bash
./utils/helm/test/install-chart.sh
```

You can access the LibreChat frontend at http://localhost:8081

To uninstall it use:

```bash
helm uninstall librechat
```

> Note that PersistentVolumeClaims are not deleted when the chart is uninstalled.

You can delete them manually with:

```bash
kubectl delete pvc -l app.kubernetes.io/instance=librechat
```

If you need to change the chart values to update use:

```bash
helm upgrade librechat ./chart -f ./chart/values.yaml -f ./test/values-test.yaml
```
