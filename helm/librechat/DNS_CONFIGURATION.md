# DNS Configuration for LibreChat Helm Chart

This feature allows you to configure custom DNS settings for LibreChat pods, enabling traffic redirection to proxy servers or custom endpoints.

## Use Cases

- **Proxy Redirection**: Redirect AI service traffic (AWS Bedrock, OpenAI, etc.) to internal proxy servers
- **Corporate DNS**: Use company-specific DNS servers for name resolution
- **Traffic Control**: Route specific domains through custom DNS servers while maintaining cluster DNS for others
- **Security**: Enforce traffic to go through security proxies or gateways

## Configuration Options

### DNS Policy

The `dnsPolicy` field determines how DNS resolution works:

- `ClusterFirst` (default): Prefer cluster DNS, fallback to configured DNS
- `Default`: Use the node's DNS settings
- `None`: Only use the DNS settings from `dnsConfig`
- `ClusterFirstWithHostNet`: For pods using host network

### DNS Config

The `dnsConfig` field allows you to specify:

- `nameservers`: List of DNS server IPs (max 3)
- `searches`: List of DNS search domains for hostname lookup
- `options`: List of DNS resolver options

## Examples

### Basic Configuration

```yaml
# values.yaml
dnsPolicy: "None"
dnsConfig:
  nameservers:
    - "10.0.0.10"  # Custom DNS server
```

### Redirect AI Services to Proxy

```yaml
# values.yaml
dnsPolicy: "None"
dnsConfig:
  nameservers:
    - "10.96.0.100"  # DNS server that redirects AI domains to proxy
  searches:
    - "svc.cluster.local"
  options:
    - name: ndots
      value: "2"
```

Deploy:
```bash
helm upgrade --install librechat ./helm/librechat -f values.yaml
```

### Corporate DNS Configuration

```yaml
# values.yaml
dnsPolicy: "None"
dnsConfig:
  nameservers:
    - "192.168.1.53"  # Primary corporate DNS
    - "192.168.1.54"  # Secondary corporate DNS
  searches:
    - "corp.internal"
    - "svc.cluster.local"
```

## Testing

### Verify DNS Configuration

1. Deploy with custom DNS settings:
```bash
helm install librechat ./helm/librechat \
  --set dnsPolicy="None" \
  --set dnsConfig.nameservers[0]="10.0.0.10"
```

2. Check pod DNS configuration:
```bash
kubectl exec <pod-name> -- cat /etc/resolv.conf
```

3. Test DNS resolution:
```bash
kubectl exec <pod-name> -- nslookup example.com
```

### Test Results

The feature has been tested with the following scenarios:

✅ **DNS Resolution Test**
- Custom nameservers properly configured in pods
- Domains resolve to configured proxy IPs
- Traffic successfully redirected to proxy servers

✅ **Multiple Nameservers**
- Primary and fallback DNS servers work correctly
- Failover happens when primary is unavailable

✅ **Integration Test**
- Works with existing LibreChat configuration
- No conflicts with cluster DNS when using ClusterFirst policy
- Compatible with all pod security contexts

## Advanced Usage

### Combining with Host Aliases

For simple host-to-IP mappings, you can combine DNS configuration with hostAliases:

```yaml
# In deployment spec (not directly in values.yaml)
spec:
  dnsPolicy: "None"
  dnsConfig:
    nameservers:
      - "10.0.0.10"
  hostAliases:
    - ip: "10.100.50.200"
      hostnames:
        - "api.openai.com"
```

### Dynamic DNS Configuration

You can use Helm's templating to dynamically set DNS based on environment:

```yaml
{{- if eq .Values.environment "production" }}
dnsPolicy: "None"
dnsConfig:
  nameservers:
    - "10.0.0.10"  # Production DNS
{{- else }}
dnsPolicy: "ClusterFirst"  # Use default in dev
{{- end }}
```

## Troubleshooting

### DNS Not Resolving

1. Check pod's DNS policy:
```bash
kubectl get pod <pod-name> -o yaml | grep -A5 dnsPolicy
```

2. Verify nameservers are reachable:
```bash
kubectl exec <pod-name> -- ping <nameserver-ip>
```

### Configuration Not Applied

Ensure values are properly indented in values.yaml:
```yaml
dnsPolicy: "None"  # Top level, not under any section
dnsConfig:         # Top level, not under any section
  nameservers:
    - "10.0.0.10"
```

## Security Considerations

- Ensure DNS servers are trusted and secure
- Use TLS-enabled DNS servers when possible
- Monitor DNS query logs for unusual activity
- Consider using DNS policies that maintain cluster DNS as fallback

## Compatibility

- Kubernetes 1.19+
- Compatible with all LibreChat deployment modes
- Works with both MongoDB and Meilisearch enabled/disabled
- No additional permissions required