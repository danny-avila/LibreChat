# LibreChat OpenShift Deployment Makefile
# Usage: make deploy NAMESPACE=librechat-fips

NAMESPACE ?= librechat-fips
CLUSTER_DOMAIN ?= $(shell oc whoami --show-server 2>/dev/null | sed 's|https://api\.||' | sed 's|:6443||')
ROUTE_HOST = librechat-$(NAMESPACE).apps.$(CLUSTER_DOMAIN)

.PHONY: help deploy undeploy status logs update-config port-forward clean check-prereqs

help: ## Show this help
	@echo "LibreChat OpenShift Deployment"
	@echo ""
	@echo "Usage: make <target> [NAMESPACE=librechat-fips]"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'
	@echo ""
	@echo "Examples:"
	@echo "  make deploy                    # Deploy to default namespace"
	@echo "  make deploy NAMESPACE=myns     # Deploy to custom namespace"
	@echo "  make status                    # Check deployment status"
	@echo "  make logs                      # View application logs"

check-prereqs: ## Check prerequisites (oc, helm, .env)
	@command -v oc >/dev/null 2>&1 || { echo "Error: oc CLI not found"; exit 1; }
	@command -v helm >/dev/null 2>&1 || { echo "Error: helm CLI not found"; exit 1; }
	@oc whoami >/dev/null 2>&1 || { echo "Error: Not logged into OpenShift"; exit 1; }
	@test -f .env || { echo "Error: .env file not found"; exit 1; }
	@echo "Prerequisites OK"
	@echo "  Cluster: $(CLUSTER_DOMAIN)"
	@echo "  Namespace: $(NAMESPACE)"

deploy: check-prereqs ## Deploy LibreChat to OpenShift
	@./deploy-openshift.sh $(NAMESPACE) $(CLUSTER_DOMAIN)

undeploy: ## Remove LibreChat deployment
	@echo "Uninstalling LibreChat from $(NAMESPACE)..."
	-helm uninstall librechat -n $(NAMESPACE) --wait
	-oc delete route librechat -n $(NAMESPACE)
	-oc delete configmap librechat-config -n $(NAMESPACE)
	-oc delete secret librechat-credentials-env -n $(NAMESPACE)
	-oc delete pvc --all -n $(NAMESPACE)
	@echo "Uninstall complete. Namespace $(NAMESPACE) retained."

clean: undeploy ## Full cleanup including namespace
	@echo "Deleting namespace $(NAMESPACE)..."
	-oc delete project $(NAMESPACE)
	@echo "Cleanup complete."

status: ## Show deployment status
	@echo "=== Namespace: $(NAMESPACE) ==="
	@echo ""
	@echo "Pods:"
	@oc get pods -n $(NAMESPACE) 2>/dev/null || echo "  No pods found"
	@echo ""
	@echo "Services:"
	@oc get svc -n $(NAMESPACE) 2>/dev/null || echo "  No services found"
	@echo ""
	@echo "Routes:"
	@oc get route -n $(NAMESPACE) 2>/dev/null || echo "  No routes found"
	@echo ""
	@echo "PVCs:"
	@oc get pvc -n $(NAMESPACE) 2>/dev/null || echo "  No PVCs found"

logs: ## View LibreChat application logs
	oc logs -f deployment/librechat-librechat -n $(NAMESPACE)

logs-mcp: ## View MCP-related logs
	oc logs deployment/librechat-librechat -n $(NAMESPACE) | grep -i '\[MCP\]' | tail -50

logs-mongodb: ## View MongoDB logs
	oc logs -f deployment/librechat-mongodb -n $(NAMESPACE)

update-config: ## Update librechat.yaml configuration
	@./update-librechat-config.sh $(NAMESPACE) ./librechat.yaml

port-forward: ## Forward port 3080 locally
	@echo "Forwarding https://localhost:3080 -> LibreChat"
	@echo "Press Ctrl+C to stop"
	oc port-forward deployment/librechat-librechat 3080:3080 -n $(NAMESPACE)

restart: ## Restart the LibreChat deployment
	oc rollout restart deployment/librechat-librechat -n $(NAMESPACE)
	oc rollout status deployment/librechat-librechat -n $(NAMESPACE) --timeout=180s

scale: ## Scale deployment (usage: make scale REPLICAS=2)
	@if [ -z "$(REPLICAS)" ]; then echo "Usage: make scale REPLICAS=2"; exit 1; fi
	oc scale deployment/librechat-librechat --replicas=$(REPLICAS) -n $(NAMESPACE)

url: ## Print the application URL
	@echo "https://$(shell oc get route librechat -n $(NAMESPACE) -o jsonpath='{.spec.host}' 2>/dev/null || echo '$(ROUTE_HOST)')"

test-health: ## Test the health endpoint
	@curl -s -o /dev/null -w "%{http_code}" https://$(shell oc get route librechat -n $(NAMESPACE) -o jsonpath='{.spec.host}')/health && echo " OK" || echo " FAILED"

# === Migration targets ===

export-agents: ## Export agents from current cluster (run on SOURCE cluster)
	@echo "Exporting agents from $(NAMESPACE)..."
	@mkdir -p migration
	@POD=$$(oc get pods -n $(NAMESPACE) -l app.kubernetes.io/name=mongodb -o jsonpath='{.items[0].metadata.name}'); \
	oc exec $$POD -n $(NAMESPACE) -c mongodb -- mongosh --quiet --eval "JSON.stringify(db.agents.find().toArray())" LibreChat > migration/agents-export.json; \
	oc exec $$POD -n $(NAMESPACE) -c mongodb -- mongosh --quiet --eval "JSON.stringify(db.aclentries.find().toArray())" LibreChat > migration/aclentries-export.json
	@echo "Exported to migration/agents-export.json"

import-agents: ## Import agents to current cluster (usage: make import-agents EMAIL=user@example.com)
	@if [ -z "$(EMAIL)" ]; then echo "Usage: make import-agents EMAIL=user@example.com [NAME='Display Name'] [PUBLIC=true]"; exit 1; fi
	@if [ ! -f migration/agents-export.json ]; then echo "Error: migration/agents-export.json not found. Run 'make export-agents' on source cluster first."; exit 1; fi
	python3 scripts/migrate-agents.py \
		--agents migration/agents-export.json \
		--new-user-email "$(EMAIL)" \
		$(if $(NAME),--new-user-name "$(NAME)") \
		$(if $(PUBLIC),--make-public) \
		--target-namespace $(NAMESPACE)
