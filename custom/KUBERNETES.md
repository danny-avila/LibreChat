# LibreChat Kubernetes Deployment Guide

This guide explains how to deploy our customized LibreChat fork to Kubernetes while properly managing custom files and configurations.

## Prerequisites

- Docker installed and configured
- Kubernetes cluster (AKS, GKE, EKS, or other)
- `kubectl` installed and configured to access your cluster
- Helm 3 installed
- Container registry access (Azure Container Registry, Docker Hub, etc.)
- Existing MongoDB instance accessible from your Kubernetes cluster

## Deployment Architecture

Our deployment uses the following components:

1. **LibreChat Application**: The main application container
2. **External MongoDB**: Database for chat history and user data (not deployed as part of this stack)
3. **Meilisearch**: Search service
4. **Vector Database (pgvector)**: For RAG operations
5. **RAG API**: API for Retrieval-Augmented Generation

All custom files and configurations are organized in the `custom/` directory.

## Customization Organization

We organize all customizations in the `custom/` directory with the following structure:

```
custom/
│
├── api/             # Custom backend API components
├── client/          # Custom frontend components
├── config/          # Custom configuration files
│   └── k8s/         # Kubernetes-specific configuration
└── data/            # Persistent data specific to our customizations
```

This structure allows us to:
- Separate our customizations from the main codebase
- Easily merge updates from upstream
- Maintain clean Kubernetes deployments

## Deployment Steps

### 1. Configure Registry, MongoDB Connection, and Image Name

Edit the following files to set your container registry and MongoDB connection information:

- `custom/config/k8s/custom-values.yaml`: 
  - Update `image.repository`
  - Configure the MongoDB connection string in the `env` section:
    ```yaml
    env:
      - name: MONGO_URI
        value: "mongodb://username:password@your-mongodb-host:27017/LibreChat"
    ```
  - Or preferably, use a Kubernetes secret (see Secrets Management section)

### 2. Build and Push the Docker Image

You can use the provided scripts to build and push the Docker image:

#### For Linux/Mac:
```bash
chmod +x custom/build-and-deploy.sh
./custom/build-and-deploy.sh [image-name] [tag] [registry] [namespace] [release-name]
```

#### For Windows:
```powershell
.\custom\build-and-deploy.ps1 -ImageName "librechat-custom" -ImageTag "latest" -Registry "your-registry" -Namespace "librechat" -HelmReleaseName "librechat"
```

### 3. Manual Deployment (Alternative)

If you prefer to deploy manually:

1. Build the Docker image:
   ```bash
   docker build -t your-registry/librechat-custom:latest -f Dockerfile.custom .
   ```

2. Push the image to your registry:
   ```bash
   docker push your-registry/librechat-custom:latest
   ```

3. Create a Kubernetes namespace:
   ```bash
   kubectl create namespace librechat
   ```

4. Deploy with Helm:
   ```bash
   helm upgrade --install librechat ./charts/librechat \
     --namespace librechat \
     -f custom/config/k8s/custom-values.yaml \
     --set image.repository=your-registry/librechat-custom \
     --set image.tag=latest
   ```

## External MongoDB Configuration

### Connection String

The application uses the `MONGO_URI` environment variable to connect to MongoDB. The format is:

```
mongodb://username:password@hostname:port/database
```

For high availability MongoDB deployments, you can specify multiple hosts:

```
mongodb://username:password@host1:port,host2:port,host3:port/database?replicaSet=myReplicaSet
```

### Security Considerations

1. **Authentication**: Always use authentication with your MongoDB instance
2. **Network Security**: Ensure your MongoDB instance is only accessible from your Kubernetes cluster
3. **TLS/SSL**: For production, use TLS connections:
   ```
   mongodb://username:password@hostname:port/database?ssl=true
   ```

### Using Secrets for MongoDB Credentials

Instead of putting the MongoDB connection string directly in the values file, create a Kubernetes secret:

```bash
kubectl create secret generic mongodb-credentials \
  --namespace librechat \
  --from-literal=connection-string="mongodb://username:password@your-mongodb-host:27017/LibreChat"
```

Then reference it in your values file:

```yaml
env:
  - name: MONGO_URI
    valueFrom:
      secretKeyRef:
        name: mongodb-credentials
        key: connection-string
```

## Persistent Storage

The deployment uses persistent volumes for:

1. **Vector database**: Stores embedded vectors for RAG
2. **Meilisearch data**: Search indices
3. **Custom data**: Your customizations and uploads

Make sure your Kubernetes cluster has an appropriate storage class available. Edit the `storageClass` in `custom-values.yaml` to match your environment.

## Secrets Management

For production deployments, avoid storing secrets in the values file. Instead:

1. Create Kubernetes secrets:
   ```bash
   kubectl create secret generic librechat-secrets \
     --namespace librechat \
     --from-literal=MEILI_MASTER_KEY=your-secure-key \
     --from-literal=POSTGRES_PASSWORD=your-secure-password
   ```

2. Reference secrets in the values file:
   ```yaml
   meilisearch:
     masterKey:
       valueFrom:
         secretKeyRef:
           name: librechat-secrets
           key: MEILI_MASTER_KEY
   ```

## Ingress Configuration

The deployment includes an NGINX Ingress configuration. Update the `ingress` section in `custom-values.yaml` with your domain and TLS settings:

```yaml
ingress:
  enabled: true
  className: nginx
  annotations:
    kubernetes.io/ingress.class: nginx
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - host: librechat.yourdomain.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: librechat-tls
      hosts:
        - librechat.yourdomain.com
```

## Scaling

The deployment includes autoscaling configuration. Adjust the `autoscaling` section in `custom-values.yaml` to match your requirements:

```yaml
autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 80
  targetMemoryUtilizationPercentage: 80
```

## Monitoring and Maintenance

### Monitoring

Check the status of your deployment:
```bash
kubectl get pods -n librechat
kubectl get services -n librechat
kubectl describe deployment librechat -n librechat
```

View logs:
```bash
kubectl logs -f deployment/librechat -n librechat
```

### Updating the Deployment

To update the deployment with new changes:

1. Update your custom files in the `custom/` directory
2. Rebuild and redeploy using the build script:
   ```bash
   ./custom/build-and-deploy.sh
   ```

### Backing Up Data

Regularly back up:
- Your external MongoDB database
- Vector database 
- Meilisearch data
- Custom data

## Troubleshooting

### Common Issues

1. **MongoDB Connection Issues**: Check if the application can connect to your MongoDB instance:
   ```bash
   kubectl exec -it [pod-name] -n librechat -- ping your-mongodb-host
   kubectl exec -it [pod-name] -n librechat -- mongo --host your-mongodb-host --username username --password
   ```

2. **Pod Pending**: Check if PVCs are being provisioned correctly:
   ```bash
   kubectl get pvc -n librechat
   ```

3. **Container Crashes**: Check logs for errors:
   ```bash
   kubectl logs -f deployment/librechat -n librechat
   ```

4. **Ingress Issues**: Check Ingress controller logs:
   ```bash
   kubectl logs -f -n ingress-nginx deployment/ingress-nginx-controller
   ```

## Security Considerations

1. **Network Policies**: Implement Kubernetes network policies to restrict pod communication
2. **RBAC**: Set appropriate RBAC permissions for service accounts
3. **Secrets**: Use Kubernetes secrets or an external secrets manager
4. **Image Scanning**: Regularly scan container images for vulnerabilities
5. **Pod Security**: Apply Pod Security Standards (PSS) restrictive policies

## Conclusion

This deployment approach allows you to:
1. Maintain a clean separation between upstream code and your customizations
2. Easily update when new LibreChat versions are released
3. Scale your deployment according to your needs
4. Keep all custom files in a persistent, manageable location
5. Use your existing MongoDB infrastructure 