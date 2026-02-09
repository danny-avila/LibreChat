.PHONY: db grafana logs build upgrade restart status deploy

# Forward MongoDB port (27017)
# Usage: make db
db:
	@echo "🔌 Forwarding MongoDB (librechat/mongodb) to localhost:27017..."
	kubectl --kubeconfig k8s-ovh/kubeconfig.yml port-forward -n librechat service/mongodb 27017:27017

# Forward Grafana Dashboard port (3000)
# Usage: make grafana
grafana:
	@echo "📊 Forwarding Grafana (monitoring/grafana) to localhost:3000..."
	kubectl --kubeconfig k8s-ovh/kubeconfig.yml port-forward -n monitoring svc/kube-prometheus-stack-grafana 3000:80

# Watch logs for LibreChat API
# Usage: make logs
logs:
	@echo "📜 Streaming logs for LibreChat API..."
	kubectl --kubeconfig k8s-ovh/kubeconfig.yml logs -n librechat deployment/librechat-api -f

# Build and Push Docker Image
# Usage: make build
build:
	@echo "🏗️ Building and Pushing Docker Image..."
	docker build --platform linux/amd64 -t fekihatelm/librechat-custom:latest . && docker push fekihatelm/librechat-custom:latest

# Upgrade Helm Release
# Usage: make upgrade
upgrade:
	@echo "🚀 Upgrading Helm Release..."
	helm --kubeconfig k8s-ovh/kubeconfig.yml upgrade accessllm helm/accessllm -f helm/accessllm/values.yaml -n librechat

# Restart Deployment
# Usage: make restart
restart:
	@echo "🔄 Restarting Deployment..."
	kubectl --kubeconfig k8s-ovh/kubeconfig.yml rollout restart deployment/librechat-api -n librechat

# Check Rollout Status
# Usage: make status
status:
	@echo "⏳ Waiting for Rollout..."
	kubectl --kubeconfig k8s-ovh/kubeconfig.yml rollout status deployment/librechat-api -n librechat

# Full Deployment Cycle
# Usage: make deploy
deploy: build upgrade restart status
	@echo "✅ Deployment Complete!"
