.PHONY: db grafana

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
