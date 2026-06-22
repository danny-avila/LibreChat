# Langfuse Fanout Collector

LibreChat can send tenant-scoped agent traces to a tenant Langfuse project and
also copy those traces to a central Langfuse project. This is optional and is
disabled unless you explicitly deploy the fanout collector.

## How It Works

- Agent traces use Langfuse OTLP ingestion.
- LibreChat sends tenant traces to the local collector when
  `LANGFUSE_FANOUT_ENABLED=true` and `LANGFUSE_FANOUT_COLLECTOR_URL` points at
  the collector.
- The collector exports every trace to the central Langfuse project using
  `LANGFUSE_FANOUT_CENTRAL_AUTH_HEADER`. This prebuilt header is collector-only;
  the LibreChat app derives central score auth from `LANGFUSE_PUBLIC_KEY` and
  `LANGFUSE_SECRET_KEY`.
- The collector also exports the same trace to the tenant Langfuse project by
  routing a LibreChat-stamped destination key to one of the configured tenant
  Langfuse base URLs, then forwarding the tenant `Authorization` header that
  LibreChat attaches to the OTLP request.
- Tenant export is conditional. LibreChat marks traces as tenant-exportable only
  when tenant keys are configured and `LANGFUSE_FANOUT_TENANT_EXPORT_DISABLED`
  is not true; unmarked traces are still exported to central but are dropped by
  the tenant pipeline.
- LibreChat's routing attributes are consumed by the collector and deleted
  before central or tenant export, so they are not forwarded to Langfuse.
- User feedback scores use Langfuse's direct REST API from the LibreChat API
  process. Central scores use LibreChat's normal central Langfuse env config;
  tenant scores use tenant app configuration when tenant fanout is enabled.

Tenant Langfuse keys are expected to come from LibreChat app configuration, for
example from an admin panel or another configuration data source. They are not
defined in this collector config.

## Limitations

- Langfuse base URLs are startup configuration. `LANGFUSE_FANOUT_CENTRAL_BASE_URL`
  and the tenant destination map must be known when LibreChat and the collector
  start. Tenant app configuration may choose any configured tenant destination.
- Tenant Langfuse API keys can be added, changed, or disabled in tenant app
  configuration at runtime without restarting LibreChat or the collector.
- Tenant app configuration must set a Langfuse base URL matching one of the
  startup destinations before tenant trace/score export is enabled; keys alone
  are treated as central-only.
- `LANGFUSE_FANOUT_TENANT_EXPORT_DISABLED=true` can be set on LibreChat as an
  emergency switch to stop tenant trace and score export while keeping central
  collector export active. When omitted, false, or blank, tenant export remains
  available if tenant keys and a known destination are configured.
- This supports Langfuse Cloud and self-hosted Langfuse as long as each allowed
  tenant base URL is configured at LibreChat/collector startup. Runtime tenant
  config selects from those known destinations; it does not inject arbitrary
  export URLs into the collector.
- The provided Compose collector config is a three-region Langfuse Cloud preset
  (`eu`, `us`, `jp`). For self-hosted or additional destination keys,
  use Helm values or update/generate the collector routing table and exporters
  in lockstep with `LANGFUSE_FANOUT_TENANT_DESTINATIONS`.

## Docker Compose

Set the central Langfuse destination in `.env`:

```dotenv
# Used by LibreChat for central feedback scores. Set this to the same non-EU
# region as LANGFUSE_FANOUT_CENTRAL_BASE_URL when applicable.
LANGFUSE_BASE_URL=https://cloud.langfuse.com

# Used by the collector for central trace export.
LANGFUSE_FANOUT_CENTRAL_BASE_URL=https://cloud.langfuse.com
LANGFUSE_FANOUT_CENTRAL_AUTH_HEADER=Basic <base64-public-key-colon-secret-key>
# Compose's included collector config supports these three destination keys.
# Do not add a custom key unless the collector routing table also has a matching pipeline/exporter.
LANGFUSE_FANOUT_TENANT_DESTINATIONS=eu=https://cloud.langfuse.com,us=https://us.cloud.langfuse.com,jp=https://jp.cloud.langfuse.com
LANGFUSE_FANOUT_TENANT_EU_BASE_URL=https://cloud.langfuse.com
LANGFUSE_FANOUT_TENANT_US_BASE_URL=https://us.cloud.langfuse.com
LANGFUSE_FANOUT_TENANT_JP_BASE_URL=https://jp.cloud.langfuse.com
LANGFUSE_FANOUT_TENANT_EXPORT_DISABLED=false
LANGFUSE_FANOUT_BATCH_TIMEOUT=1s
LANGFUSE_FANOUT_BATCH_SEND_SIZE=128
```

Langfuse Cloud base URL options:

| Region | Base URL                        |
| ------ | ------------------------------- |
| EU     | `https://cloud.langfuse.com`    |
| US     | `https://us.cloud.langfuse.com` |
| JP     | `https://jp.cloud.langfuse.com` |

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
    destinations:
      eu:
        baseUrl: https://cloud.langfuse.com
      us:
        baseUrl: https://us.cloud.langfuse.com
      jp:
        baseUrl: https://jp.cloud.langfuse.com
  batchTimeout: 1s
  batchSendSize: 128
```

The chart renders the collector Deployment, Service, and collector ConfigMap,
and injects `LANGFUSE_FANOUT_ENABLED` plus `LANGFUSE_FANOUT_COLLECTOR_URL` into
the LibreChat app ConfigMap when they are not already supplied in
`librechat.configEnv`.

## Notes

- The collector only handles traces. Feedback scores go directly to Langfuse's
  REST API from the LibreChat API process.
- `LANGFUSE_FANOUT_CENTRAL_AUTH_HEADER` must be a full Basic auth header and is
  consumed by the collector only. The app does not use it for scores.
- `LANGFUSE_FANOUT_CENTRAL_BASE_URL` is also consumed by the collector only.
  For non-EU central feedback scores, set LibreChat's normal `LANGFUSE_BASE_URL`
  to the same central Langfuse region.
- Tenant destinations default to the three configured Langfuse Cloud regions. Add or
  override `langfuseFanout.tenant.destinations` in Helm for self-hosted or
  custom destinations. Compose's included collector config is static; if you add
  custom destination keys there, update or regenerate `otelcol.yaml` as well.
- `LANGFUSE_FANOUT_BATCH_TIMEOUT` and `LANGFUSE_FANOUT_BATCH_SEND_SIZE` tune
  the OTel batch processors. The defaults (`1s`, `128`) favor low latency and
  modest memory use; high-volume deployments may increase them for throughput.
- `LANGFUSE_FANOUT_COLLECTOR_URL` is the local collector URL used by LibreChat,
  not a Langfuse Cloud base URL.
