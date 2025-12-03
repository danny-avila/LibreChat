# LibreChat Artifacts Feature - FIPS-Compliant Implementation Guide

This document describes how to implement the LibreChat Artifacts feature in a FIPS-compliant manner for OpenShift deployment.

## Overview

### What is Artifacts?

Artifacts is a generative UI feature in LibreChat that enables AI to create interactive content:
- **React components** - Live, editable code rendered in the browser
- **HTML applications** - Interactive web content
- **Mermaid diagrams** - Flowcharts, sequence diagrams, etc.

The feature uses [Sandpack](https://sandpack.codesandbox.io/) (CodeSandbox's rendering engine) to securely execute code in browser sandboxes.

### Default Behavior (Non-Compliant)

By default, Artifacts connects to CodeSandbox's public CDN:
- Sends code to external servers for bundling
- Includes telemetry
- Not suitable for air-gapped or compliance-sensitive environments

### FIPS-Compliant Approach

Self-host both bundler components on UBI-based containers within your OpenShift cluster, keeping all traffic internal.

## Architecture

### Components Required

| Component | Purpose | Deployment Type | Container Needed |
|-----------|---------|-----------------|------------------|
| **Sandpack Bundler** | Bundles JavaScript/React code for execution | Separate Service | Yes - new sidecar/service |
| **Static Browser Server** | Provides isolated preview sandboxes via unique subdomains | Separate Service | Yes - new sidecar/service |
| **LibreChat** | Main application | Existing | Already deployed |

### Network Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        OpenShift Cluster                            │
│                                                                     │
│  ┌──────────────┐      ┌──────────────────┐                        │
│  │              │      │                  │                        │
│  │  LibreChat   │─────▶│ Sandpack Bundler │                        │
│  │   (React)    │      │   (nginx/UBI)    │                        │
│  │              │      │                  │                        │
│  └──────┬───────┘      └──────────────────┘                        │
│         │                                                           │
│         │              ┌──────────────────┐      ┌───────────────┐ │
│         │              │  Static Browser  │      │   Wildcard    │ │
│         └─────────────▶│     Server       │◀────▶│   Route/DNS   │ │
│                        │   (Node.js/UBI)  │      │ *.preview.app │ │
│                        └──────────────────┘      └───────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Sandpack Bundler

**Source Repository:** [LibreChat-AI/codesandbox-client](https://github.com/LibreChat-AI/codesandbox-client)

**What it does:**
- Compiles and bundles JavaScript/React code
- Serves static assets (compiled bundler files)
- Stateless - serves pre-built static files via nginx

**Current (non-compliant) Dockerfile:**
```dockerfile
FROM nginx:1.25.3-alpine
WORKDIR /var/www/codesandbox
COPY www ./
```

**FIPS-Compliant Containerfile:**
```dockerfile
# Build stage - compile the bundler
FROM registry.redhat.io/ubi9/nodejs-20:latest AS builder

WORKDIR /build

# Install yarn
RUN npm install -g yarn

# Copy source and build
COPY . .
RUN yarn install --frozen-lockfile
RUN yarn build:deps
RUN yarn build:sandpack

# Production stage - serve with UBI nginx
FROM registry.redhat.io/ubi9/nginx-122:latest

# Copy built assets
COPY --from=builder /build/www /opt/app-root/src

# nginx configuration for Sandpack
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
```

**Required nginx.conf:**
```nginx
worker_processes auto;
error_log /var/log/nginx/error.log;
pid /run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Required for worker files
    types {
        application/javascript js mjs;
        application/javascript worker.js;
    }

    server {
        listen 8080;
        server_name _;
        root /opt/app-root/src;
        index index.html;

        # CORS headers for LibreChat
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods "GET, OPTIONS";
        add_header Access-Control-Allow-Headers "Content-Type";

        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }

        location / {
            try_files $uri $uri/ /index.html;
        }
    }
}
```

**OpenShift Resources:**
- Deployment
- Service (ClusterIP, port 8080)
- Route (optional - internal service is sufficient)

### 2. Static Browser Server

**Source Repository:** [LibreChat-AI/static-browser-server](https://github.com/LibreChat-AI/static-browser-server)

**What it does:**
- Provides isolated browser sandboxes for code preview
- Uses unique subdomains for origin isolation (security feature)
- Runs a Node.js/Fastify server

**Critical Requirement: Wildcard DNS/TLS**

Each preview gets a unique subdomain:
```
https://[random-id]-preview.apps.cluster.example.com
```

This requires:
- Wildcard DNS record: `*.preview.apps.cluster.example.com`
- Wildcard TLS certificate for that domain
- OpenShift Route with wildcard support

**FIPS-Compliant Containerfile:**
```dockerfile
FROM registry.redhat.io/ubi9/nodejs-20:latest

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy built application
COPY out ./out
COPY public ./public

# Non-root user (already configured in UBI image)
USER 1001

EXPOSE 8080

ENV NODE_ENV=production
ENV PORT=8080

CMD ["node", "out/servers/demo-server.js"]
```

**Build Process:**
```bash
# Clone and build locally first
git clone https://github.com/LibreChat-AI/static-browser-server.git
cd static-browser-server
npm install
npm run build:prod

# Then build container with compiled output
podman build --platform linux/amd64 -t static-browser-server:latest .
```

**OpenShift Resources:**
- Deployment
- Service (ClusterIP, port 8080)
- **Wildcard Route** (critical for subdomain isolation)

### 3. LibreChat Configuration

**Environment Variables:**

Add to LibreChat deployment or secret:
```yaml
# Sandpack Bundler URL (internal service)
SANDPACK_BUNDLER_URL: "http://sandpack-bundler:8080"

# Static Browser Server URL (must be externally accessible with wildcard)
SANDPACK_STATIC_BUNDLER_URL: "https://preview.apps.cluster.example.com"
```

## OpenShift Deployment Manifests

### Directory Structure

```
manifests/
├── base/
│   ├── kustomization.yaml
│   └── artifacts/
│       ├── sandpack-bundler-deployment.yaml
│       ├── sandpack-bundler-service.yaml
│       ├── static-browser-deployment.yaml
│       ├── static-browser-service.yaml
│       └── static-browser-route.yaml
└── overlays/
    └── production/
        ├── kustomization.yaml
        └── artifacts-config.yaml
```

### Sandpack Bundler Deployment

```yaml
# sandpack-bundler-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sandpack-bundler
  labels:
    app: sandpack-bundler
    app.kubernetes.io/part-of: librechat
spec:
  replicas: 2
  selector:
    matchLabels:
      app: sandpack-bundler
  template:
    metadata:
      labels:
        app: sandpack-bundler
    spec:
      containers:
        - name: bundler
          image: image-registry.openshift-image-registry.svc:5000/librechat/sandpack-bundler:latest
          ports:
            - containerPort: 8080
              protocol: TCP
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "256Mi"
              cpu: "500m"
          readinessProbe:
            httpGet:
              path: /
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 30
          securityContext:
            allowPrivilegeEscalation: false
            runAsNonRoot: true
            seccompProfile:
              type: RuntimeDefault
            capabilities:
              drop:
                - ALL
---
# sandpack-bundler-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: sandpack-bundler
  labels:
    app: sandpack-bundler
spec:
  selector:
    app: sandpack-bundler
  ports:
    - port: 8080
      targetPort: 8080
      protocol: TCP
  type: ClusterIP
```

### Static Browser Server Deployment

```yaml
# static-browser-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: static-browser-server
  labels:
    app: static-browser-server
    app.kubernetes.io/part-of: librechat
spec:
  replicas: 2
  selector:
    matchLabels:
      app: static-browser-server
  template:
    metadata:
      labels:
        app: static-browser-server
    spec:
      containers:
        - name: server
          image: image-registry.openshift-image-registry.svc:5000/librechat/static-browser-server:latest
          ports:
            - containerPort: 8080
              protocol: TCP
          env:
            - name: NODE_ENV
              value: "production"
            - name: PORT
              value: "8080"
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          readinessProbe:
            httpGet:
              path: /
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 30
          securityContext:
            allowPrivilegeEscalation: false
            runAsNonRoot: true
            seccompProfile:
              type: RuntimeDefault
            capabilities:
              drop:
                - ALL
---
# static-browser-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: static-browser-server
  labels:
    app: static-browser-server
spec:
  selector:
    app: static-browser-server
  ports:
    - port: 8080
      targetPort: 8080
      protocol: TCP
  type: ClusterIP
```

### Wildcard Route for Static Browser Server

```yaml
# static-browser-route.yaml
apiVersion: route.openshift.io/v1
kind: Route
metadata:
  name: static-browser-wildcard
  labels:
    app: static-browser-server
  annotations:
    # Enable wildcard routing
    haproxy.router.openshift.io/wildcard: "true"
spec:
  # Wildcard host - matches *.preview.apps.cluster.example.com
  host: wildcard.preview.apps.cluster.example.com
  wildcardPolicy: Subdomain
  to:
    kind: Service
    name: static-browser-server
    weight: 100
  port:
    targetPort: 8080
  tls:
    termination: edge
    insecureEdgeTerminationPolicy: Redirect
    # Use cluster's wildcard certificate or provide custom
    # certificate: |
    #   -----BEGIN CERTIFICATE-----
    #   ...
    # key: |
    #   -----BEGIN PRIVATE KEY-----
    #   ...
```

**Note:** Wildcard routes require cluster-admin configuration. See [OpenShift Wildcard Routes Documentation](https://docs.openshift.com/container-platform/latest/networking/routes/route-configuration.html#nw-wildcard-routes_route-configuration).

## Implementation Steps

### Phase 1: Build FIPS-Compliant Container Images

1. **Clone and build Sandpack Bundler:**
   ```bash
   git clone https://github.com/LibreChat-AI/codesandbox-client.git
   cd codesandbox-client

   # Build locally (requires Node.js and Yarn)
   yarn install
   yarn build:deps
   yarn build:sandpack

   # Build container on ec2-dev (or use /build-remote)
   # Create Containerfile.fips with UBI base
   podman build --platform linux/amd64 -t sandpack-bundler:latest -f Containerfile.fips .
   ```

2. **Clone and build Static Browser Server:**
   ```bash
   git clone https://github.com/LibreChat-AI/static-browser-server.git
   cd static-browser-server

   npm install
   npm run build:prod

   # Build container
   podman build --platform linux/amd64 -t static-browser-server:latest -f Containerfile.fips .
   ```

3. **Push to OpenShift registry:**
   ```bash
   # Tag and push both images
   podman tag sandpack-bundler:latest default-route-openshift-image-registry.apps.cluster.example.com/librechat/sandpack-bundler:latest
   podman push default-route-openshift-image-registry.apps.cluster.example.com/librechat/sandpack-bundler:latest

   podman tag static-browser-server:latest default-route-openshift-image-registry.apps.cluster.example.com/librechat/static-browser-server:latest
   podman push default-route-openshift-image-registry.apps.cluster.example.com/librechat/static-browser-server:latest
   ```

### Phase 2: Configure Wildcard DNS/TLS

1. **Request wildcard DNS record:**
   - Work with your DNS administrator
   - Create: `*.preview.apps.cluster.example.com` → OpenShift router IP

2. **Obtain wildcard TLS certificate:**
   - Request from your PKI team or use Let's Encrypt
   - Must cover: `*.preview.apps.cluster.example.com`

3. **Configure OpenShift for wildcard routes:**
   ```bash
   # Requires cluster-admin
   oc patch ingresscontroller default -n openshift-ingress \
     --type=merge \
     -p '{"spec":{"routeAdmission":{"wildcardPolicy":"WildcardsAllowed"}}}'
   ```

### Phase 3: Deploy to OpenShift

1. **Deploy Sandpack Bundler:**
   ```bash
   oc apply -f manifests/base/artifacts/sandpack-bundler-deployment.yaml -n librechat
   oc apply -f manifests/base/artifacts/sandpack-bundler-service.yaml -n librechat
   ```

2. **Deploy Static Browser Server:**
   ```bash
   oc apply -f manifests/base/artifacts/static-browser-deployment.yaml -n librechat
   oc apply -f manifests/base/artifacts/static-browser-service.yaml -n librechat
   oc apply -f manifests/base/artifacts/static-browser-route.yaml -n librechat
   ```

3. **Update LibreChat configuration:**
   ```bash
   # Update the secret with new environment variables
   oc set env deployment/librechat-librechat \
     SANDPACK_BUNDLER_URL=http://sandpack-bundler:8080 \
     SANDPACK_STATIC_BUNDLER_URL=https://preview.apps.cluster.example.com \
     -n librechat
   ```

### Phase 4: Verify Deployment

1. **Test Sandpack Bundler:**
   ```bash
   oc exec -it deployment/librechat-librechat -n librechat -- \
     curl -s http://sandpack-bundler:8080/ | head -20
   ```

2. **Test Static Browser Server:**
   ```bash
   curl -s https://test-preview.apps.cluster.example.com/
   ```

3. **Test Artifacts in LibreChat:**
   - Open LibreChat UI
   - Ask AI to "Create a simple React counter component"
   - Verify the Artifact renders and is interactive

## Security Considerations

### FIPS Compliance Notes

| Component | FIPS Status | Notes |
|-----------|-------------|-------|
| LibreChat | Compliant | Use Chainguard librechat-fips or UBI-based image |
| Sandpack Bundler | Compliant | UBI nginx serves static files only |
| Static Browser Server | Compliant | UBI Node.js with FIPS OpenSSL |
| Browser Execution | N/A | Client-side JS, no server crypto |

### Network Security

- Sandpack Bundler: Internal service only (ClusterIP)
- Static Browser Server: Exposed via wildcard route (required for subdomain isolation)
- All inter-service communication stays within cluster
- TLS termination at OpenShift router

### Content Security Policy

Update LibreChat's CSP headers to allow the self-hosted bundler:
```
frame-src 'self' https://*.preview.apps.cluster.example.com;
```

## Troubleshooting

### Common Issues

**Artifacts not loading:**
- Check `SANDPACK_BUNDLER_URL` is accessible from LibreChat pod
- Verify CORS headers on bundler responses

**Preview sandbox not rendering:**
- Verify wildcard DNS resolves correctly
- Check wildcard TLS certificate is valid
- Ensure `wildcardPolicy: WildcardsAllowed` is enabled on ingress controller

**Service Worker errors:**
- Confirm HTTPS is working (Service Workers require secure context)
- Check browser console for specific errors

### Useful Commands

```bash
# Check bundler logs
oc logs deployment/sandpack-bundler -n librechat

# Check static browser server logs
oc logs deployment/static-browser-server -n librechat

# Test internal connectivity
oc exec -it deployment/librechat-librechat -n librechat -- \
  curl -v http://sandpack-bundler:8080/

# Verify wildcard route
oc get route static-browser-wildcard -n librechat -o yaml
```

## References

- [LibreChat Artifacts Documentation](https://www.librechat.ai/docs/features/artifacts)
- [LibreChat CodeSandbox Client Fork](https://github.com/LibreChat-AI/codesandbox-client)
- [LibreChat Static Browser Server](https://github.com/LibreChat-AI/static-browser-server)
- [Sandpack Hosting Guide](https://sandpack.codesandbox.io/docs/guides/hosting-the-bundler)
- [OpenShift Wildcard Routes](https://docs.openshift.com/container-platform/latest/networking/routes/route-configuration.html)
- [Chainguard LibreChat FIPS Image](https://images.chainguard.dev/directory/image/librechat-fips/overview)
