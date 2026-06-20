# Langfuse Fanout Collector

LibreChat can send tenant-scoped agent traces to a tenant Langfuse project and
also copy those traces to a central Langfuse project. This is optional and is
disabled unless you explicitly deploy the fanout collector.

## How It Works

- Agent traces use Langfuse OTLP ingestion.
- LibreChat sends tenant traces to the local collector when
  `LANGFUSE_FANOUT_ENABLED=true` and `LANGFUSE_FANOUT_BASE_URL` points at the
  collector.
- The collector exports every trace to the central Langfuse project using
  `LANGFUSE_FANOUT_CENTRAL_AUTH_HEADER`.
- The collector also exports the same trace to the tenant Langfuse project by
  forwarding the tenant `Authorization` header that LibreChat attaches to the
  OTLP request.
- User feedback scores use Langfuse's direct REST API. Scores are sent to the
  central project and, when tenant Langfuse keys are configured, the tenant
  project.

Tenant Langfuse keys are expected to come from LibreChat app configuration, for
example from an admin panel or another configuration data source. They are not
defined in this collector config.

## Docker Compose

Set the central Langfuse destination in `.env`:

```dotenv
LANGFUSE_FANOUT_CENTRAL_BASE_URL=https://cloud.langfuse.com
LANGFUSE_FANOUT_CENTRAL_AUTH_HEADER=Basic <base64-public-key-colon-secret-key>
LANGFUSE_FANOUT_TENANT_BASE_URL=https://cloud.langfuse.com
```

Then start LibreChat with the fanout override:

```sh
docker compose -f docker-compose.yml -f docker-compose.langfuse-fanout.yml up -d
```

For the deployed compose stack:

```sh
docker compose -f deploy-compose.yml -f deploy-compose.langfuse-fanout.yml up -d
```

The override sets `LANGFUSE_FANOUT_ENABLED=true` and points LibreChat at
`http://langfuse-fanout-collector:4318`.

## Helm

Create a secret containing the central Langfuse Basic auth header:

```sh
kubectl create secret generic langfuse-central \
  --from-literal=LANGFUSE_FANOUT_CENTRAL_AUTH_HEADER='Basic <base64-public-key-colon-secret-key>'
```

Enable the collector in values:

```yaml
langfuseFanout:
  enabled: true
  central:
    baseUrl: https://cloud.langfuse.com
    authHeaderSecret:
      name: langfuse-central
      key: LANGFUSE_FANOUT_CENTRAL_AUTH_HEADER
  tenant:
    baseUrl: https://cloud.langfuse.com
```

The chart renders the collector Deployment, Service, and collector ConfigMap,
and injects `LANGFUSE_FANOUT_ENABLED` plus `LANGFUSE_FANOUT_BASE_URL` into the
LibreChat app ConfigMap when they are not already supplied in
`librechat.configEnv`.

## Notes

- The collector only handles traces. Feedback scores go directly to Langfuse's
  REST API from the LibreChat API process.
- `LANGFUSE_FANOUT_CENTRAL_AUTH_HEADER` must be a full Basic auth header.
- The tenant and central Langfuse base URLs default to `https://cloud.langfuse.com`.
