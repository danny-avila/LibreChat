# Kubernetes Deployment for LibreChat

This directory contains Kubernetes manifests to deploy LibreChat to a Kubernetes cluster.

## 📋 Prerequisites

- Kubernetes cluster (1.20+)
- kubectl configured
- At least 20GB available storage
- LoadBalancer support (for cloud) or Ingress controller (for on-premise)

## 🏗️ Architecture

```
External Traffic → LoadBalancer (NGINX)
                      ↓
                  LibreChat API (2 replicas)
                      ↓
        ┌─────────────┼─────────────┐
        ↓             ↓             ↓
    MongoDB      Meilisearch    LiteLLM
                                  ↓
                            RAG API + VectorDB
```

## 📁 File Structure

- `00-namespace.yaml` - Creates isolated namespace
- `01-configmap.yaml` - Non-sensitive configuration
- `02-secrets.yaml` - **EDIT THIS**: Sensitive credentials
- `03-pvc.yaml` - Persistent storage claims
- `10-mongodb.yaml` - MongoDB database
- `11-meilisearch.yaml` - Search engine
- `12-vectordb-rag.yaml` - Vector DB + RAG API
- `13-litellm.yaml` - AI model proxy
- `20-librechat-api.yaml` - Main application
- `21-nginx.yaml` - Web server/load balancer

## 🚀 Quick Start

### 1. Update Secrets

Edit `02-secrets.yaml` and replace with your base64-encoded values:

```bash
# Generate base64-encoded secrets
echo -n "your-mongo-password" | base64
echo -n "your-litellm-key" | base64
```

### 2. Deploy

Make the script executable and run it:

```bash
chmod +x deploy.sh
./deploy.sh
```

Or deploy manually:

```bash
kubectl apply -f .
```

### 3. Check Status

```bash
# View all resources
kubectl get all -n librechat

# View pods
kubectl get pods -n librechat

# View services
kubectl get svc -n librechat
```

### 4. Access Application

```bash
# Get external IP (may take a few minutes)
kubectl get svc nginx -n librechat

# Access at: http://<EXTERNAL-IP>
```

## 🔧 Configuration

### Resource Limits

Each deployment has resource requests/limits. Adjust in the YAML files:

```yaml
resources:
  requests:    # Minimum guaranteed
    memory: "1Gi"
    cpu: "500m"
  limits:      # Maximum allowed
    memory: "4Gi"
    cpu: "2000m"
```

### Scaling

Scale deployments:

```bash
# Scale API to 3 replicas
kubectl scale deployment librechat-api -n librechat --replicas=3

# Scale NGINX
kubectl scale deployment nginx -n librechat --replicas=3
```

### Storage

Adjust storage sizes in `03-pvc.yaml`:

```yaml
resources:
  requests:
    storage: 20Gi  # Change as needed
```

## 📊 Monitoring

```bash
# View logs
kubectl logs -f deployment/librechat-api -n librechat

# Describe pod for events
kubectl describe pod <pod-name> -n librechat

# Execute commands in pod
kubectl exec -it <pod-name> -n librechat -- sh
```

## 🔄 Updates

### Update Image

```bash
# Edit deployment
kubectl edit deployment librechat-api -n librechat

# Or apply new version
kubectl set image deployment/librechat-api api=fekihatelm/librechat-custom:new-tag -n librechat

# Restart deployment
kubectl rollout restart deployment/librechat-api -n librechat
```

### Rollback

```bash
# View rollout history
kubectl rollout history deployment/librechat-api -n librechat

# Rollback to previous version
kubectl rollout undo deployment/librechat-api -n librechat
```

## 🧹 Cleanup

Delete everything:

```bash
kubectl delete namespace librechat
```

Or delete individual resources:

```bash
kubectl delete -f .
```

## 🐛 Troubleshooting

### Pods not starting

```bash
# Check pod status
kubectl get pods -n librechat

# View pod events
kubectl describe pod <pod-name> -n librechat

# Check logs
kubectl logs <pod-name> -n librechat
```

### Storage issues

```bash
# Check PVCs
kubectl get pvc -n librechat

# Check PVs
kubectl get pv
```

### Network issues

```bash
# Test connectivity from a pod
kubectl run -it --rm debug --image=alpine --restart=Never -n librechat -- sh

# Inside pod:
apk add curl
curl http://mongodb:27017
```

## 🌐 Production Considerations

### 1. Use Ingress Instead of LoadBalancer

Create `ingress.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: librechat-ingress
  namespace: librechat
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  tls:
  - hosts:
    - yourdomain.com
    secretName: librechat-tls
  rules:
  - host: yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: nginx
            port:
              number: 80
```

### 2. Use Real Secrets Management

- Use Sealed Secrets
- Use External Secrets Operator
- Use Cloud provider secrets (AWS Secrets Manager, GCP Secret Manager, etc.)

### 3. Set Up Monitoring

- Install Prometheus + Grafana
- Use built-in metrics server
- Set up alerts for resource usage

### 4. Backup Strategy

- Regular database backups
- PV snapshots
- Test restore procedures

## 📝 Notes

- MongoDB is stateful - use StatefulSet in production
- Adjust replica counts based on load
- Monitor resource usage and adjust limits
- Keep secrets secure and rotate regularly
- Use network policies for security
