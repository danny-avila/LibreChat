#!/bin/bash
# Deploy LibreChat to Kubernetes

echo "🚀 Deploying LibreChat to Kubernetes..."

# Apply manifests in order
kubectl apply -f 00-namespace.yaml
echo "✅ Namespace created"

kubectl apply -f 01-configmap.yaml
echo "✅ ConfigMap created"

kubectl apply -f 01-librechat-yaml-configmap.yaml
echo "✅ LibreChat YAML ConfigMap created"

kubectl apply -f 02-secrets.yaml
echo "⚠️  WARNING: Update secrets with your actual base64-encoded values!"

kubectl apply -f 03-pv.yaml
echo "✅ Persistent Volumes created"

kubectl apply -f 03-pvc.yaml
echo "✅ Persistent Volume Claims created"

kubectl apply -f 10-mongodb.yaml
echo "✅ MongoDB deployed"

kubectl apply -f 11-meilisearch.yaml
echo "✅ Meilisearch deployed"

kubectl apply -f 12-vectordb-rag.yaml
echo "✅ Vector DB and RAG API deployed"

kubectl apply -f 13-litellm.yaml
echo "✅ LiteLLM deployed"

# Wait for dependencies to be ready
echo "⏳ Waiting for services to be ready..."
kubectl wait --for=condition=ready pod -l app=mongodb -n librechat --timeout=120s
kubectl wait --for=condition=ready pod -l app=vectordb -n librechat --timeout=120s

kubectl apply -f 20-librechat-api.yaml
echo "✅ LibreChat API deployed"

kubectl apply -f 21-nginx.yaml
echo "✅ NGINX deployed"

echo ""
echo "📊 Checking deployment status..."
kubectl get all -n librechat

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "To access your application:"
echo "1. Get the external IP:"
echo "   kubectl get svc nginx -n librechat"
echo ""
echo "2. Access via: http://<EXTERNAL-IP>"
echo ""
echo "To view logs:"
echo "   kubectl logs -f deployment/librechat-api -n librechat"
echo ""
echo "To delete everything:"
echo "   kubectl delete namespace librechat"
