# LibreChat Helm Chart

## Local Development

### Prerequisites

Install k3d:

```bash
curl -s https://raw.githubusercontent.com/rancher/k3d/main/install.sh | bash
```

Create a k3d cluster

```bash
k3d cluster create librechat
```

Install the external secret operator:

```bash
kubectl apply -k "https://github.com/external-secrets/external-secrets//config/crds/bases?ref=v0.9.11"
```

Check for newer version: https://external-secrets.io/latest/introduction/getting-started/

Install the fake store:

```bash
./utils/helm/test/load-fake-store.sh
```

