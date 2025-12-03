# LibreChat Artifacts Deployment

This directory contains OpenShift manifests for deploying the self-hosted Artifacts feature components.

## Components

| Component | Description | Image |
|-----------|-------------|-------|
| **Sandpack Bundler** | Bundles JavaScript/React code for preview | `quay.io/wjackson/sandpack-bundler-fips:latest` |
| **Static Browser Server** | Provides isolated browser sandboxes | `quay.io/wjackson/static-browser-server-fips:latest` |

## Prerequisites

### 1. Enable Wildcard Routes (Cluster Admin Required)

The Static Browser Server requires wildcard subdomain routing for security isolation:

```bash
oc patch ingresscontroller default -n openshift-ingress \
  --type=merge \
  -p '{"spec":{"routeAdmission":{"wildcardPolicy":"WildcardsAllowed"}}}'
```

### 2. Wildcard DNS (If Not Already Configured)

Your cluster needs a wildcard DNS record pointing to the router:
```
*.preview.apps.<cluster-domain> → Router IP
```

Most OpenShift clusters already have `*.apps.<cluster-domain>` configured.

## Deployment

### Deploy Both Components

```bash
oc apply -k manifests/base/artifacts/ -n librechat
```

### Or Deploy Individually

```bash
oc apply -f manifests/base/artifacts/sandpack-bundler.yaml -n librechat
oc apply -f manifests/base/artifacts/static-browser-server.yaml -n librechat
```

## Configure LibreChat

Add these environment variables to your LibreChat deployment:

```bash
# Sandpack Bundler (internal service)
SANDPACK_BUNDLER_URL=http://sandpack-bundler:8080

# Static Browser Server (must be externally accessible with wildcard)
SANDPACK_STATIC_BUNDLER_URL=https://preview.apps.<your-cluster-domain>
```

### Using Helm Values

Add to your `values-openshift-minimal.yaml`:

```yaml
librechat:
  extraEnvVars:
    - name: SANDPACK_BUNDLER_URL
      value: "http://sandpack-bundler:8080"
    - name: SANDPACK_STATIC_BUNDLER_URL
      value: "https://preview.apps.cluster-mqwwr.mqwwr.sandbox1259.opentlc.com"
```

## Verify Deployment

```bash
# Check pods
oc get pods -l app.kubernetes.io/component=artifacts -n librechat

# Test Sandpack Bundler (from within cluster)
oc exec -it deployment/librechat-librechat -n librechat -- \
  curl -s http://sandpack-bundler:8080/health

# Test Static Browser Server (external)
curl -s https://test-preview.apps.<cluster-domain>/
```

## Troubleshooting

### Artifacts Not Loading

1. Check if Sandpack Bundler is accessible:
   ```bash
   oc logs deployment/sandpack-bundler -n librechat
   ```

2. Verify CORS headers are set:
   ```bash
   curl -I http://sandpack-bundler:8080/
   ```

### Preview Not Rendering

1. Check wildcard route configuration:
   ```bash
   oc get route static-browser-wildcard -n librechat -o yaml
   ```

2. Verify wildcard DNS resolves:
   ```bash
   dig +short test-preview.apps.<cluster-domain>
   ```

3. Check Static Browser Server logs:
   ```bash
   oc logs deployment/static-browser-server -n librechat
   ```
