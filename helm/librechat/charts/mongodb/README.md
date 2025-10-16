<!--- app-name: MongoDB&reg; -->

# MongoDB&reg; packaged by Bitnami

MongoDB&reg; is a relational open source NoSQL database. Easy to use, it stores data in JSON-like documents. Automated scalability and high-performance. Ideal for developing cloud native applications.

[Overview of MongoDB&reg;](http://www.mongodb.org)

Disclaimer: The respective trademarks mentioned in the offering are owned by the respective companies. We do not provide a commercial license for any of these products. This listing has an open-source license. MongoDB&reg; is run and maintained by MongoDB, which is a completely separate project from Bitnami.

## TL;DR

```console
helm install my-release oci://registry-1.docker.io/bitnamicharts/mongodb
```

> Tip: Did you know that this app is also available as a Kubernetes App on the Azure Marketplace? Kubernetes Apps are the easiest way to deploy Bitnami on AKS. Click [here](https://azuremarketplace.microsoft.com/en-us/marketplace/apps/bitnami.mongodb-cnab) to see the listing on Azure Marketplace.

Looking to use MongoDBreg; in production? Try [VMware Tanzu Application Catalog](https://bitnami.com/enterprise), the commercial edition of the Bitnami catalog.

## ⚠️ Important Notice: Upcoming changes to the Bitnami Catalog

Beginning August 28th, 2025, Bitnami will evolve its public catalog to offer a curated set of hardened, security-focused images under the new [Bitnami Secure Images initiative](https://news.broadcom.com/app-dev/broadcom-introduces-bitnami-secure-images-for-production-ready-containerized-applications). As part of this transition:

- Granting community users access for the first time to security-optimized versions of popular container images.
- Bitnami will begin deprecating support for non-hardened, Debian-based software images in its free tier and will gradually remove non-latest tags from the public catalog. As a result, community users will have access to a reduced number of hardened images. These images are published only under the “latest” tag and are intended for development purposes
- Starting August 28th, over two weeks, all existing container images, including older or versioned tags (e.g., 2.50.0, 10.6), will be migrated from the public catalog (docker.io/bitnami) to the “Bitnami Legacy” repository (docker.io/bitnamilegacy), where they will no longer receive updates.
- For production workloads and long-term support, users are encouraged to adopt Bitnami Secure Images, which include hardened containers, smaller attack surfaces, CVE transparency (via VEX/KEV), SBOMs, and enterprise support.

These changes aim to improve the security posture of all Bitnami users by promoting best practices for software supply chain integrity and up-to-date deployments. For more details, visit the [Bitnami Secure Images announcement](https://github.com/bitnami/containers/issues/83267).

## Introduction

This chart bootstraps a [MongoDB(&reg;)](https://github.com/bitnami/containers/tree/main/bitnami/mongodb) deployment on a [Kubernetes](https://kubernetes.io) cluster using the [Helm](https://helm.sh) package manager.

## Architecture

This chart allows installing MongoDB(&reg;) using two different architecture setups: `standalone` or `replicaset`. Use the `architecture` parameter to choose the one to use:

```console
architecture="standalone"
architecture="replicaset"
```

### Standalone architecture

The *standalone* architecture installs a deployment (or StatefulSet) with one MongoDB&reg; server (it cannot be scaled):

```text
     ----------------
    |   MongoDB&reg; |
    |      svc       |
     ----------------
            |
            v
       ------------
      |MongoDB&reg;|
      |   Server   |
      |    Pod     |
       -----------
```

### Replicaset architecture

The chart also supports the *replicaset* architecture with and without a MongoDB(&reg;) Arbiter:

When the MongoDB(&reg;) Arbiter is enabled, the chart installs two StatefulSets: A StatefulSet with N MongoDB(&reg;) servers (organised with one primary and N-1 secondary nodes), and a StatefulSet with one MongoDB(&reg;) arbiter node (it cannot be scaled).

```text
     ----------------   ----------------   ----------------      -------------
    | MongoDB&reg; 0 | | MongoDB&reg; 1 | | MongoDB&reg; N |    |   Arbiter   |
    |  external svc  | |  external svc  | |  external svc  |    |     svc     |
     ----------------   ----------------   ----------------      -------------
            |                  |                  |                    |
            v                  v                  v                    v
     ----------------   ----------------   ----------------      --------------
    | MongoDB&reg; 0 | | MongoDB&reg; 1 | | MongoDB&reg; N |    | MongoDB&reg; |
    |    Server      | |     Server     | |     Server     |    |    Arbiter   |
    |     Pod        | |      Pod       | |      Pod       |    |     Pod      |
     ----------------   ----------------   ----------------      --------------
          primary           secondary         secondary
```

The PSA model is useful when the third Availability Zone cannot hold a full MongoDB(&reg;) instance. The MongoDB(&reg;) Arbiter as decision maker is lightweight and can run alongside other workloads.

> NOTE: An update takes your MongoDB(&reg;) replicaset offline if the Arbiter is enabled and the number of MongoDB(&reg;) replicas is two. Helm applies updates to the StatefulSets for the MongoDB(&reg;) instance and the Arbiter at the same time so you lose two out of three quorum votes.

Without the Arbiter, the chart deploys a single statefulset with N MongoDB(&reg;) servers (organised with one primary and N-1 secondary nodes).

```text
     ----------------   ----------------   ----------------
    | MongoDB&reg; 0 | | MongoDB&reg; 1 | | MongoDB&reg; N |
    |  external svc  | |  external svc  | |  external svc  |
     ----------------   ----------------   ----------------
            |                  |                  |
            v                  v                  v
     ----------------   ----------------   ----------------
    | MongoDB&reg; 0 | | MongoDB&reg; 1 | | MongoDB&reg; N |
    |    Server      | |     Server     | |     Server     |
    |     Pod        | |      Pod       | |      Pod       |
     ----------------   ----------------   ----------------
          primary           secondary         secondary
```

There are no services load balancing requests between MongoDB(&reg;) nodes; instead, each node has an associated service to access them individually.

> NOTE: Although the first replica is initially assigned the primary role, any of the secondary nodes can become the primary if it is down, or during upgrades. Do not make any assumption about what replica has the primary role. Instead, configure your MongoDB(&reg;) client with the list of MongoDB(&reg;) hostnames so it can dynamically choose the node to send requests.

## Prerequisites

- Kubernetes 1.23+
- Helm 3.8.0+
- PV provisioner support in the underlying infrastructure

## Installing the Chart

To install the chart with the release name `my-release`:

```console
helm install my-release oci://REGISTRY_NAME/REPOSITORY_NAME/mongodb
```

> Note: You need to substitute the placeholders `REGISTRY_NAME` and `REPOSITORY_NAME` with a reference to your Helm chart registry and repository. For example, in the case of Bitnami, you need to use `REGISTRY_NAME=registry-1.docker.io` and `REPOSITORY_NAME=bitnamicharts`.

The command deploys MongoDB(&reg;) on the Kubernetes cluster in the default configuration. The [Parameters](#parameters) section lists the parameters that can be configured during installation.

> **Tip**: List all releases using `helm list`

## Configuration and installation details

### Resource requests and limits

Bitnami charts allow setting resource requests and limits for all containers inside the chart deployment. These are inside the `resources` value (check parameter table). Setting requests is essential for production workloads and these should be adapted to your specific use case.

To make this process easier, the chart contains the `resourcesPreset` values, which automatically sets the `resources` section according to different presets. Check these presets in [the bitnami/common chart](https://github.com/bitnami/charts/blob/main/bitnami/common/templates/_resources.tpl#L15). However, in production workloads using `resourcesPreset` is discouraged as it may not fully adapt to your specific needs. Find more information on container resource management in the [official Kubernetes documentation](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/).

### Prometheus metrics

This chart can be integrated with Prometheus by setting `metrics.enabled` to `true`. This will deploy a sidecar container with [mongodb_exporter](https://github.com/percona/mongodb_exporter) in all pods and a `metrics` service, which can be configured under the `metrics.service` section. This `metrics` service will have the necessary annotations to be automatically scraped by Prometheus.

#### Prometheus requirements

It is necessary to have a working installation of Prometheus or Prometheus Operator for the integration to work. Install the [Bitnami Prometheus helm chart](https://github.com/bitnami/charts/tree/main/bitnami/prometheus) or the [Bitnami Kube Prometheus helm chart](https://github.com/bitnami/charts/tree/main/bitnami/kube-prometheus) to easily have a working Prometheus in your cluster.

#### Integration with Prometheus Operator

The chart can deploy `ServiceMonitor` objects for integration with Prometheus Operator installations. To do so, set the value `metrics.serviceMonitor.enabled=true`. Ensure that the Prometheus Operator `CustomResourceDefinitions` are installed in the cluster or it will fail with the following error:

```text
no matches for kind "ServiceMonitor" in version "monitoring.coreos.com/v1"
```

Install the [Bitnami Kube Prometheus helm chart](https://github.com/bitnami/charts/tree/main/bitnami/kube-prometheus) for having the necessary CRDs and the Prometheus Operator.

### [Rolling vs Immutable tags](https://techdocs.broadcom.com/us/en/vmware-tanzu/application-catalog/tanzu-application-catalog/services/tac-doc/apps-tutorials-understand-rolling-tags-containers-index.html)

It is strongly recommended to use immutable tags in a production environment. This ensures your deployment does not change automatically if the same tag is updated with a different image.

Bitnami will release a new chart updating its containers if a new version of the main container, significant changes, or critical vulnerabilities exist.

### Customize a new MongoDB instance

The [Bitnami MongoDB(&reg;) image](https://github.com/bitnami/containers/tree/main/bitnami/mongodb) supports the use of custom scripts to initialize a fresh instance. In order to execute the scripts, two options are available:

- Specify them using the `initdbScripts` parameter as dict.
- Define an external Kubernetes ConfigMap with all the initialization scripts by setting the `initdbScriptsConfigMap` parameter. Note that this will override the previous option.

The allowed script extensions are `.sh` and `.js`.

### Replicaset: Access MongoDB(&reg;) nodes from outside the cluster

In order to access MongoDB(&reg;) nodes from outside the cluster when using a replicaset architecture, a specific service per MongoDB(&reg;) pod will be created. There are two ways of configuring external access:

- Using LoadBalancer services
- Using NodePort services.

#### Use LoadBalancer services

Three alternatives are available to use *LoadBalancer* services:

- Use random load balancer IP addresses using an *initContainer* that waits for the IP addresses to be ready and discovers them automatically. An example deployment configuration is shown below:

    ```yaml
    architecture: replicaset
    replicaCount: 2
    externalAccess:
      enabled: true
      service:
        type: LoadBalancer
      autoDiscovery:
        enabled: true
    serviceAccount:
      create: true
    automountServiceAccountToken: true
    rbac:
      create: true
    ```

    > NOTE: This option requires creating RBAC rules on clusters where RBAC policies are enabled.

- Manually specify the load balancer IP addresses. An example deployment configuration is shown below, with the placeholder EXTERNAL-IP-ADDRESS-X used in place of the load balancer IP addresses:

    ```yaml
    architecture: replicaset
    replicaCount: 2
    externalAccess:
      enabled: true
      service:
        type: LoadBalancer
        loadBalancerIPs:
          - 'EXTERNAL-IP-ADDRESS-1'
          - 'EXTERNAL-IP-ADDRESS-2'
    ```

    > NOTE: This option requires knowing the load balancer IP addresses, so that each MongoDB&reg; node's advertised hostname is configured with it.

- Specify `externalAccess.service.publicNames`. These names must be resolvable by the MongoDB&reg; containers. To ensure that, if this value is set, an initContainer is added to wait for the ip addresses associated to those names. We can combine this feature with `external-dns`, setting the required annotations to configure the load balancer names:

    ```yaml
    architecture: replicaset
    replicaCount: 2
    externalAccess:
      enabled: true
      service:
        type: LoadBalancer
        publicNames:
          - 'mongodb-0.example.com'
          - 'mongodb-1.example.com'
        annotationsList:
          - external-dns.alpha.kubernetes.io/hostname: mongodb-0.example.com
          - external-dns.alpha.kubernetes.io/hostname: mongodb-1.example.com
    ```

    > NOTE: If register new DNS records for those names is not an option, the release can be upgraded setting `hostAliases` with the public IPs assigned to the external services.

#### Use NodePort services

Manually specify the node ports to use. An example deployment configuration is shown below, with the placeholder NODE-PORT-X used in place of the node ports:

```text
architecture=replicaset
replicaCount=2
externalAccess.enabled=true
externalAccess.service.type=NodePort
externalAccess.service.nodePorts[0]='NODE-PORT-1'
externalAccess.service.nodePorts[1]='NODE-PORT-2'
```

> NOTE: This option requires knowing the node ports that will be exposed, so each MongoDB&reg; node's advertised hostname is configured with it.

The pod will try to get the external IP address of the node using the command `curl -s https://ipinfo.io/IP-ADDRESS` unless the `externalAccess.service.domain` parameter is set.

### Bootstrapping with an External Cluster

This chart is equipped with the ability to bring online a set of Pods that connect to an existing MongoDB(&reg;) deployment that lies outside of Kubernetes. This effectively creates a hybrid MongoDB(&reg;) Deployment where both Pods in Kubernetes and Instances such as Virtual Machines can partake in a single MongoDB(&reg;) Deployment. This is helpful in situations where one may be migrating MongoDB(&reg;) from Virtual Machines into Kubernetes, for example. To take advantage of this, use the following as an example configuration:

```yaml
externalAccess:
  externalMaster:
    enabled: true
    host: external-mongodb-0.internal
```

:warning: To bootstrap MongoDB(&reg;) with an external master that lies outside of Kubernetes, be sure to set up external access using any of the suggested methods in this chart to have connectivity between the MongoDB(&reg;) members. :warning:

### Add extra environment variables

To add extra environment variables (useful for advanced operations like custom init scripts), use the `extraEnvVars` property.

```yaml
extraEnvVars:
  - name: LOG_LEVEL
    value: error
```

Alternatively, you can use a ConfigMap or a Secret with the environment variables. To do so, use the `extraEnvVarsCM` or the `extraEnvVarsSecret` properties.

### Use Sidecars and Init Containers

If additional containers are needed in the same pod (such as additional metrics or logging exporters), they can be defined using the `sidecars` config parameter.

```yaml
sidecars:
- name: your-image-name
  image: your-image
  imagePullPolicy: Always
  ports:
  - name: portname
    containerPort: 1234
```

If these sidecars export extra ports, extra port definitions can be added using the `service.extraPorts` parameter (where available), as shown in the example below:

```yaml
service:
  extraPorts:
  - name: extraPort
    port: 11311
    targetPort: 11311
```

> NOTE: This Helm chart already includes sidecar containers for the Prometheus exporters (where applicable). These can be activated by adding the `--enable-metrics=true` parameter at deployment time. The `sidecars` parameter should therefore only be used for any extra sidecar containers.

If additional init containers are needed in the same pod, they can be defined using the `initContainers` parameter. Here is an example:

```yaml
initContainers:
  - name: your-image-name
    image: your-image
    imagePullPolicy: Always
    ports:
      - name: portname
        containerPort: 1234
```

Learn more about [sidecar containers](https://kubernetes.io/docs/concepts/workloads/pods/) and [init containers](https://kubernetes.io/docs/concepts/workloads/pods/init-containers/).

### Update credentials

Bitnami charts, with its default settings, configure credentials at first boot. Any further change in the secrets or credentials can be done using one of the following methods:

#### Manual update of the passwords and secrets

- Update the user password following [the upstream documentation](https://www.mongodb.com/docs/manual/reference/method/db.changeUserPassword/)
- Update the password secret with the new values (replace the SECRET_NAME, PASSWORDS and ROOT_PASSWORD placeholders)

```shell
kubectl create secret generic SECRET_NAME --from-literal=mongodb-passwords=PASSWORD --from-literal=mongodb-root-password=ROOT_PASSWORD --dry-run -o yaml | kubectl apply -f -
```

#### Automated update using a password update job

The Bitnami MongoDB provides a password update job that will automatically change the MongoDB passwords when running helm upgrade. To enable the job set `passwordUpdateJob.enabled=true`. This job requires:

- The new passwords: this is configured using either `auth.rootPassword`, `auth.passwords` and `metrics.passwords` (if applicable) or setting `auth.existingSecret`.
- The previous root password: This value is taken automatically from already deployed secret object. If you are using `auth.existingSecret` or `helm template` instead of `helm upgrade`, then set either `passwordUpdateJob.previousPasswords.rootPassword` or  setting `passwordUpdateJob.previousPasswords.existingSecret`.

In the following example we update only the root password via values.yaml in a MongoDB installation:

```yaml
auth:
  rootPassword: "newRootPassword123"
passwordUpdateJob:
  enabled: true
```

In the following example we update the password via values.yaml in a MongoDB installation with replication and several usernames and databases (including metrics).

```yaml
architecture: "replicaset"

auth:
  usernames:
    - "user1"
    - "user2"
  rootPassword: "newRootPassword123"
  passwords:
    - "newUserPassword123"
    - "newUserPassword144"
  databases:
    - "userdatabase"
    - "userdatabase2"

metrics:
  username: "metricsuser"
  password: "newMetricsPassword"

passwordUpdateJob:
  enabled: true
```

In this example we use two existing secrets (`new-password-secret` and `previous-password-secret`) to update several users and passwords (including metrics):

```yaml
auth:
  usernames:
    - "user1"
    - "user2"
  databases:
    - "userdatabase"
    - "userdatabase2"
  existingSecret: new-password-secret

metrics:
  username: "metricsuser"

passwordUpdateJob:
  enabled: true
  previousPasswords:
    existingSecret: previous-password-secret
```

You can add extra update commands using the `passwordUpdateJob.extraCommands` value.

### Backup and restore

Two different approaches are available to back up and restore Bitnami MongoDB&reg; Helm chart deployments on Kubernetes:

- Back up the data from the source deployment and restore it in a new deployment using MongoDB&reg; built-in backup/restore tools.
- Back up the persistent volumes from the source deployment and attach them to a new deployment using Velero, a Kubernetes backup/restore tool.

#### Method 1: Backup and restore data using MongoDB&reg; built-in tools

This method involves the following steps:

- Use the *mongodump* tool to create a snapshot of the data in the source cluster.
- Create a new MongoDB&reg; Cluster deployment and forward the MongoDB&reg; Cluster service port for the new deployment.
- Restore the data using the *mongorestore* tool to import the backup to the new cluster.

> NOTE: Under this approach, it is important to create the new deployment on the destination cluster using the same credentials as the original deployment on the source cluster.

#### Method 2: Back up and restore persistent data volumes

This method involves copying the persistent data volumes for the MongoDB&reg; nodes and reusing them in a new deployment with [Velero](https://velero.io/), an open source Kubernetes backup/restore tool. This method is only suitable when:

- The Kubernetes provider is [supported by Velero](https://velero.io/docs/latest/supported-providers/).
- Both clusters are on the same Kubernetes provider, as this is a requirement of [Velero's native support for migrating persistent volumes](https://velero.io/docs/latest/migration-case/).
- The restored deployment on the destination cluster will have the same name, namespace, topology and credentials as the original deployment on the source cluster.

This method involves the following steps:

- Install Velero on the source and destination clusters.
- Use Velero to back up the PersistentVolumes (PVs) used by the deployment on the source cluster.
- Use Velero to restore the backed-up PVs on the destination cluster.
- Create a new deployment on the destination cluster with the same chart, deployment name, credentials and other parameters as the original. This new deployment will use the restored PVs and hence the original data.

Refer to our detailed [tutorial on backing up and restoring MongoDB&reg; chart deployments on Kubernetes](https://techdocs.broadcom.com/us/en/vmware-tanzu/application-catalog/tanzu-application-catalog/services/tac-doc/apps-tutorials-backup-restore-data-mongodb-kubernetes-index.html), which covers both these approaches, for more information.

### Use custom Prometheus rules

Custom Prometheus rules can be defined for the Prometheus Operator by using the `prometheusRule` parameter. A basic configuration example is shown below:

```text
    metrics:
      enabled: true
      prometheusRule:
        enabled: true
        rules:
        - name: rule1
          rules:
          - alert: HighRequestLatency
            expr: job:request_latency_seconds:mean5m{job="myjob"} > 0.5
            for: 10m
            labels:
              severity: page
            annotations:
              summary: High request latency
```

### Securing traffic using TLS

This chart supports enabling SSL/TLS between nodes in the cluster, as well as between MongoDB(&reg;) clients and nodes, by setting the `MONGODB_EXTRA_FLAGS` and `MONGODB_CLIENT_EXTRA_FLAGS` container environment variables, together with the correct `MONGODB_ADVERTISED_HOSTNAME`. To enable full TLS encryption, set the `tls.enabled` parameter to `true`.

#### Generate the self-signed certificates via pre-install Helm hooks

The `secrets-ca.yaml` file utilizes the Helm "pre-install" hook to ensure that the certificates will only be generated on chart install.

The `genCA()` function will create a new self-signed x509 certificate authority. The `genSignedCert()` function creates an object with the certificate and key, which are base64-encoded and used in a YAML-like object. The `genSignedCert()` function is passed the CN, an empty IP list (the nil part), the validity and the CA created previously.

A Kubernetes Secret is used to hold the signed certificate created above, and the `initContainer` sets up the rest. Using Helm's hook annotations ensures that the certificates will only be generated on chart install. This will prevent overriding the certificates if the chart is upgraded.

#### Use your own CA

To use your own CA, set `tls.caCert` and `tls.caKey` with appropriate base64 encoded data. The `secrets-ca.yaml` file will utilize this data to create the Secret.

> NOTE: Currently, only RSA private keys are supported.

#### Use your own certificates

To use your own certificates, set `tls.standalone.existingSecret`, `tls.replicaset.existingSecrets`, `tls.hidden.existingSecrets` and/or `tls.arbiter.existingSecret` secrets according to your needs. All of them must be references to `kubernetes.io/tls` secrets and the certificates must be created using the same CA. The CA can be added directly to each secret using the `ca.crt` key:

```shell
kubectl create secret tls "mongodb-0-cert"  --cert="mongodb-0.crt" --key="mongodb-0.key"
kubectl patch secret "mongodb-0-cert" -p="{\"data\":{\"ca.crt\": \"$(cat ca.crt | base64 -w0 )\"}}"
```

Or adding it to the "endpoint certificate" and setting the value `tls.pemChainIncluded`. If we reuse the example above, the `mongodb-0.crt` file should include CA cert and we shouldn't need to patch the secret to add the `ca.crt` set key.

> NOTE: Certificates should be signed for the fully qualified domain names. If `externalAccess.service.publicNames`is set, those names should be used in the certificates set in `tls.replicaset.existingSecrets`.

#### Access the cluster

To access the cluster, enable the init container which generates the MongoDB(&reg;) server/client PEM key needed to access the cluster. Please be sure to include the `$my_hostname` section with your actual hostname, and the alternative hostnames section should contain the hostnames that should be allowed access to the MongoDB(&reg;) replicaset. Additionally, if external access is enabled, the load balancer IP addresses are added to the alternative names list.

> NOTE: You will be generating self-signed certificates for the MongoDB(&reg;) deployment. The init container generates a new MongoDB(&reg;) private key which will be used to create a Certificate Authority (CA) and the public certificate for the CA. The Certificate Signing Request will be created as well and signed using the private key of the CA previously created. Finally, the PEM bundle will be created using the private key and public certificate. This process will be repeated for each node in the cluster.

#### Start the cluster

After the certificates have been generated and made available to the containers at the correct mount points, the MongoDB(&reg;) server will be started with TLS enabled. The options for the TLS mode will be one of `disabled`, `allowTLS`, `preferTLS`, or `requireTLS`. This value can be changed via the `MONGODB_EXTRA_FLAGS` field using the `tlsMode` parameter. The client should now be able to connect to the TLS-enabled cluster with the provided certificates.

### Set Pod affinity

This chart allows you to set your custom affinity using the `XXX.affinity` parameter(s). Find more information about Pod affinity in the [Kubernetes documentation](https://kubernetes.io/docs/concepts/configuration/assign-pod-node/#affinity-and-anti-affinity).

As an alternative, you can use the preset configurations for pod affinity, pod anti-affinity, and node affinity available at the [bitnami/common](https://github.com/bitnami/charts/tree/main/bitnami/common#affinities) chart. To do so, set the `XXX.podAffinityPreset`, `XXX.podAntiAffinityPreset`, or `XXX.nodeAffinityPreset` parameters.

## Persistence

The [Bitnami MongoDB(&reg;)](https://github.com/bitnami/containers/tree/main/bitnami/mongodb) image stores the MongoDB(&reg;) data and configurations at the `/bitnami/mongodb` path of the container.

The chart mounts a [Persistent Volume](https://kubernetes.io/docs/concepts/storage/persistent-volumes/) at this location. The volume is created using dynamic volume provisioning.

If you encounter errors when working with persistent volumes, refer to our [troubleshooting guide for persistent volumes](https://docs.bitnami.com/kubernetes/faq/troubleshooting/troubleshooting-persistence-volumes/).

## Parameters

### Global parameters

| Name                                                  | Description                                                                                                                                                                                                                                                                                                                                                         | Value   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `global.imageRegistry`                                | Global Docker image registry                                                                                                                                                                                                                                                                                                                                        | `""`    |
| `global.imagePullSecrets`                             | Global Docker registry secret names as an array                                                                                                                                                                                                                                                                                                                     | `[]`    |
| `global.defaultStorageClass`                          | Global default StorageClass for Persistent Volume(s)                                                                                                                                                                                                                                                                                                                | `""`    |
| `global.storageClass`                                 | DEPRECATED: use global.defaultStorageClass instead                                                                                                                                                                                                                                                                                                                  | `""`    |
| `global.namespaceOverride`                            | Override the namespace for resource deployed by the chart, but can itself be overridden by the local namespaceOverride                                                                                                                                                                                                                                              | `""`    |
| `global.security.allowInsecureImages`                 | Allows skipping image verification                                                                                                                                                                                                                                                                                                                                  | `false` |
| `global.compatibility.openshift.adaptSecurityContext` | Adapt the securityContext sections of the deployment to make them compatible with Openshift restricted-v2 SCC: remove runAsUser, runAsGroup and fsGroup and let the platform use their allowed default IDs. Possible values: auto (apply if the detected running cluster is Openshift), force (perform the adaptation always), disabled (do not perform adaptation) | `auto`  |

### Common parameters

| Name                      | Description                                                                                               | Value           |
| ------------------------- | --------------------------------------------------------------------------------------------------------- | --------------- |
| `nameOverride`            | String to partially override mongodb.fullname template (will maintain the release name)                   | `""`            |
| `fullnameOverride`        | String to fully override mongodb.fullname template                                                        | `""`            |
| `namespaceOverride`       | String to fully override common.names.namespace                                                           | `""`            |
| `kubeVersion`             | Force target Kubernetes version (using Helm capabilities if not set)                                      | `""`            |
| `clusterDomain`           | Default Kubernetes cluster domain                                                                         | `cluster.local` |
| `extraDeploy`             | Array of extra objects to deploy with the release                                                         | `[]`            |
| `commonLabels`            | Add labels to all the deployed resources (sub-charts are not considered). Evaluated as a template         | `{}`            |
| `commonAnnotations`       | Common annotations to add to all Mongo resources (sub-charts are not considered). Evaluated as a template | `{}`            |
| `topologyKey`             | Override common lib default topology key. If empty - "kubernetes.io/hostname" is used                     | `""`            |
| `serviceBindings.enabled` | Create secret for service binding (Experimental)                                                          | `false`         |
| `enableServiceLinks`      | Whether information about services should be injected into pod's environment variable                     | `true`          |
| `usePasswordFiles`        | Mount credentials as files instead of using environment variables                                         | `true`          |
| `diagnosticMode.enabled`  | Enable diagnostic mode (all probes will be disabled and the command will be overridden)                   | `false`         |
| `diagnosticMode.command`  | Command to override all containers in the deployment                                                      | `["sleep"]`     |
| `diagnosticMode.args`     | Args to override all containers in the deployment                                                         | `["infinity"]`  |

### MongoDB(&reg;) parameters

| Name                             | Description                                                                                                                                                                                                               | Value                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `image.registry`                 | MongoDB(&reg;) image registry                                                                                                                                                                                             | `REGISTRY_NAME`           |
| `image.repository`               | MongoDB(&reg;) image registry                                                                                                                                                                                             | `REPOSITORY_NAME/mongodb` |
| `image.digest`                   | MongoDB(&reg;) image digest in the way sha256:aa.... Please note this parameter, if set, will override the tag                                                                                                            | `""`                      |
| `image.pullPolicy`               | MongoDB(&reg;) image pull policy                                                                                                                                                                                          | `IfNotPresent`            |
| `image.pullSecrets`              | Specify docker-registry secret names as an array                                                                                                                                                                          | `[]`                      |
| `image.debug`                    | Set to true if you would like to see extra information on logs                                                                                                                                                            | `false`                   |
| `schedulerName`                  | Name of the scheduler (other than default) to dispatch pods                                                                                                                                                               | `""`                      |
| `architecture`                   | MongoDB(&reg;) architecture (`standalone` or `replicaset`)                                                                                                                                                                | `standalone`              |
| `useStatefulSet`                 | Set to true to use a StatefulSet instead of a Deployment (only when `architecture=standalone`)                                                                                                                            | `false`                   |
| `auth.enabled`                   | Enable authentication                                                                                                                                                                                                     | `true`                    |
| `auth.rootUser`                  | MongoDB(&reg;) root user                                                                                                                                                                                                  | `root`                    |
| `auth.rootPassword`              | MongoDB(&reg;) root password                                                                                                                                                                                              | `""`                      |
| `auth.usernames`                 | List of custom users to be created during the initialization                                                                                                                                                              | `[]`                      |
| `auth.passwords`                 | List of passwords for the custom users set at `auth.usernames`                                                                                                                                                            | `[]`                      |
| `auth.databases`                 | List of custom databases to be created during the initialization                                                                                                                                                          | `[]`                      |
| `auth.username`                  | DEPRECATED: use `auth.usernames` instead                                                                                                                                                                                  | `""`                      |
| `auth.password`                  | DEPRECATED: use `auth.passwords` instead                                                                                                                                                                                  | `""`                      |
| `auth.database`                  | DEPRECATED: use `auth.databases` instead                                                                                                                                                                                  | `""`                      |
| `auth.replicaSetKey`             | Key used for authentication in the replicaset (only when `architecture=replicaset`)                                                                                                                                       | `""`                      |
| `auth.existingSecret`            | Existing secret with MongoDB(&reg;) credentials (keys: `mongodb-passwords`, `mongodb-root-password`, `mongodb-metrics-password`, `mongodb-replica-set-key`)                                                               | `""`                      |
| `tls.enabled`                    | Enable MongoDB(&reg;) TLS support between nodes in the cluster as well as between mongo clients and nodes                                                                                                                 | `false`                   |
| `tls.mTLS.enabled`               | IF TLS support is enabled, require clients to provide certificates                                                                                                                                                        | `true`                    |
| `tls.autoGenerated`              | Generate a custom CA and self-signed certificates                                                                                                                                                                         | `true`                    |
| `tls.existingSecret`             | Existing secret with TLS certificates (keys: `mongodb-ca-cert`, `mongodb-ca-key`)                                                                                                                                         | `""`                      |
| `tls.caCert`                     | Custom CA certificated (base64 encoded)                                                                                                                                                                                   | `""`                      |
| `tls.caKey`                      | CA certificate private key (base64 encoded)                                                                                                                                                                               | `""`                      |
| `tls.pemChainIncluded`           | Flag to denote that the Certificate Authority (CA) certificates are bundled with the endpoint cert.                                                                                                                       | `false`                   |
| `tls.standalone.existingSecret`  | Existing secret with TLS certificates (`tls.key`, `tls.crt`, `ca.crt`) or (`tls.key`, `tls.crt`) with tls.pemChainIncluded set as enabled.                                                                                | `""`                      |
| `tls.replicaset.existingSecrets` | Array of existing secrets with TLS certificates (`tls.key`, `tls.crt`, `ca.crt`) or (`tls.key`, `tls.crt`) with tls.pemChainIncluded set as enabled.                                                                      | `[]`                      |
| `tls.hidden.existingSecrets`     | Array of existing secrets with TLS certificates (`tls.key`, `tls.crt`, `ca.crt`) or (`tls.key`, `tls.crt`) with tls.pemChainIncluded set as enabled.                                                                      | `[]`                      |
| `tls.arbiter.existingSecret`     | Existing secret with TLS certificates (`tls.key`, `tls.crt`, `ca.crt`) or (`tls.key`, `tls.crt`) with tls.pemChainIncluded set as enabled.                                                                                | `""`                      |
| `tls.image.registry`             | Init container TLS certs setup image registry                                                                                                                                                                             | `REGISTRY_NAME`           |
| `tls.image.repository`           | Init container TLS certs setup image repository                                                                                                                                                                           | `REPOSITORY_NAME/nginx`   |
| `tls.image.digest`               | Init container TLS certs setup image digest in the way sha256:aa.... Please note this parameter, if set, will override the tag                                                                                            | `""`                      |
| `tls.image.pullPolicy`           | Init container TLS certs setup image pull policy                                                                                                                                                                          | `IfNotPresent`            |
| `tls.image.pullSecrets`          | Init container TLS certs specify docker-registry secret names as an array                                                                                                                                                 | `[]`                      |
| `tls.extraDnsNames`              | Add extra dns names to the CA, can solve x509 auth issue for pod clients                                                                                                                                                  | `[]`                      |
| `tls.mode`                       | Allows to set the tls mode which should be used when tls is enabled (options: `allowTLS`, `preferTLS`, `requireTLS`)                                                                                                      | `requireTLS`              |
| `tls.resourcesPreset`            | Set container resources according to one common preset (allowed values: none, nano, micro, small, medium, large, xlarge, 2xlarge). This is ignored if tls.resources is set (tls.resources is recommended for production). | `nano`                    |
| `tls.resources`                  | Set container requests and limits for different resources like CPU or memory (essential for production workloads)                                                                                                         | `{}`                      |
| `tls.securityContext`            | Init container generate-tls-cert Security context                                                                                                                                                                         | `{}`                      |
| `automountServiceAccountToken`   | Mount Service Account token in pod                                                                                                                                                                                        | `false`                   |
| `hostAliases`                    | Add deployment host aliases                                                                                                                                                                                               | `[]`                      |
| `replicaSetName`                 | Name of the replica set (only when `architecture=replicaset`)                                                                                                                                                             | `rs0`                     |
| `replicaSetHostnames`            | Enable DNS hostnames in the replicaset config (only when `architecture=replicaset`)                                                                                                                                       | `true`                    |
| `enableIPv6`                     | Switch to enable/disable IPv6 on MongoDB(&reg;)                                                                                                                                                                           | `false`                   |
| `directoryPerDB`                 | Switch to enable/disable DirectoryPerDB on MongoDB(&reg;)                                                                                                                                                                 | `false`                   |
| `systemLogVerbosity`             | MongoDB(&reg;) system log verbosity level                                                                                                                                                                                 | `0`                       |
| `disableSystemLog`               | Switch to enable/disable MongoDB(&reg;) system log                                                                                                                                                                        | `false`                   |
| `disableJavascript`              | Switch to enable/disable MongoDB(&reg;) server-side JavaScript execution                                                                                                                                                  | `false`                   |
| `enableJournal`                  | Switch to enable/disable MongoDB(&reg;) Journaling                                                                                                                                                                        | `true`                    |
| `configuration`                  | MongoDB(&reg;) configuration file to be used for Primary and Secondary nodes                                                                                                                                              | `""`                      |

### replicaSetConfigurationSettings settings applied during runtime (not via configuration file)

| Name                                            | Description                                                                                         | Value   |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------- |
| `replicaSetConfigurationSettings.enabled`       | Enable MongoDB(&reg;) Switch to enable/disable configuring MongoDB(&reg;) run time rs.conf settings | `false` |
| `replicaSetConfigurationSettings.configuration` | run-time rs.conf settings                                                                           | `{}`    |
| `existingConfigmap`                             | Name of existing ConfigMap with MongoDB(&reg;) configuration for Primary and Secondary nodes        | `""`    |
| `initdbScripts`                                 | Dictionary of initdb scripts                                                                        | `{}`    |
| `initdbScriptsConfigMap`                        | Existing ConfigMap with custom initdb scripts                                                       | `""`    |
| `command`                                       | Override default container command (useful when using custom images)                                | `[]`    |
| `args`                                          | Override default container args (useful when using custom images)                                   | `[]`    |
| `extraFlags`                                    | MongoDB(&reg;) additional command line flags                                                        | `[]`    |
| `extraEnvVars`                                  | Extra environment variables to add to MongoDB(&reg;) pods                                           | `[]`    |
| `extraEnvVarsCM`                                | Name of existing ConfigMap containing extra env vars                                                | `""`    |
| `extraEnvVarsSecret`                            | Name of existing Secret containing extra env vars (in case of sensitive data)                       | `""`    |

### MongoDB(&reg;) statefulset parameters

| Name                                                | Description                                                                                                                                                                                                       | Value            |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `annotations`                                       | Additional labels to be added to the MongoDB(&reg;) statefulset. Evaluated as a template                                                                                                                          | `{}`             |
| `labels`                                            | Annotations to be added to the MongoDB(&reg;) statefulset. Evaluated as a template                                                                                                                                | `{}`             |
| `replicaCount`                                      | Number of MongoDB(&reg;) nodes                                                                                                                                                                                    | `2`              |
| `updateStrategy.type`                               | Strategy to use to replace existing MongoDB(&reg;) pods. When architecture=standalone and useStatefulSet=false,                                                                                                   | `RollingUpdate`  |
| `podManagementPolicy`                               | Pod management policy for MongoDB(&reg;)                                                                                                                                                                          | `OrderedReady`   |
| `podAffinityPreset`                                 | MongoDB(&reg;) Pod affinity preset. Ignored if `affinity` is set. Allowed values: `soft` or `hard`                                                                                                                | `""`             |
| `podAntiAffinityPreset`                             | MongoDB(&reg;) Pod anti-affinity preset. Ignored if `affinity` is set. Allowed values: `soft` or `hard`                                                                                                           | `soft`           |
| `nodeAffinityPreset.type`                           | MongoDB(&reg;) Node affinity preset type. Ignored if `affinity` is set. Allowed values: `soft` or `hard`                                                                                                          | `""`             |
| `nodeAffinityPreset.key`                            | MongoDB(&reg;) Node label key to match Ignored if `affinity` is set.                                                                                                                                              | `""`             |
| `nodeAffinityPreset.values`                         | MongoDB(&reg;) Node label values to match. Ignored if `affinity` is set.                                                                                                                                          | `[]`             |
| `affinity`                                          | MongoDB(&reg;) Affinity for pod assignment                                                                                                                                                                        | `{}`             |
| `nodeSelector`                                      | MongoDB(&reg;) Node labels for pod assignment                                                                                                                                                                     | `{}`             |
| `tolerations`                                       | MongoDB(&reg;) Tolerations for pod assignment                                                                                                                                                                     | `[]`             |
| `topologySpreadConstraints`                         | MongoDB(&reg;) Spread Constraints for Pods                                                                                                                                                                        | `[]`             |
| `lifecycleHooks`                                    | LifecycleHook for the MongoDB(&reg;) container(s) to automate configuration before or after startup                                                                                                               | `{}`             |
| `terminationGracePeriodSeconds`                     | MongoDB(&reg;) Termination Grace Period                                                                                                                                                                           | `""`             |
| `podLabels`                                         | MongoDB(&reg;) pod labels                                                                                                                                                                                         | `{}`             |
| `podAnnotations`                                    | MongoDB(&reg;) Pod annotations                                                                                                                                                                                    | `{}`             |
| `priorityClassName`                                 | Name of the existing priority class to be used by MongoDB(&reg;) pod(s)                                                                                                                                           | `""`             |
| `runtimeClassName`                                  | Name of the runtime class to be used by MongoDB(&reg;) pod(s)                                                                                                                                                     | `""`             |
| `podSecurityContext.enabled`                        | Enable MongoDB(&reg;) pod(s)' Security Context                                                                                                                                                                    | `true`           |
| `podSecurityContext.fsGroupChangePolicy`            | Set filesystem group change policy                                                                                                                                                                                | `Always`         |
| `podSecurityContext.supplementalGroups`             | Set filesystem extra groups                                                                                                                                                                                       | `[]`             |
| `podSecurityContext.fsGroup`                        | Group ID for the volumes of the MongoDB(&reg;) pod(s)                                                                                                                                                             | `1001`           |
| `podSecurityContext.sysctls`                        | sysctl settings of the MongoDB(&reg;) pod(s)'                                                                                                                                                                     | `[]`             |
| `containerSecurityContext.enabled`                  | Enabled containers' Security Context                                                                                                                                                                              | `true`           |
| `containerSecurityContext.seLinuxOptions`           | Set SELinux options in container                                                                                                                                                                                  | `{}`             |
| `containerSecurityContext.runAsUser`                | Set containers' Security Context runAsUser                                                                                                                                                                        | `1001`           |
| `containerSecurityContext.runAsGroup`               | Set containers' Security Context runAsGroup                                                                                                                                                                       | `1001`           |
| `containerSecurityContext.runAsNonRoot`             | Set container's Security Context runAsNonRoot                                                                                                                                                                     | `true`           |
| `containerSecurityContext.privileged`               | Set container's Security Context privileged                                                                                                                                                                       | `false`          |
| `containerSecurityContext.readOnlyRootFilesystem`   | Set container's Security Context readOnlyRootFilesystem                                                                                                                                                           | `true`           |
| `containerSecurityContext.allowPrivilegeEscalation` | Set container's Security Context allowPrivilegeEscalation                                                                                                                                                         | `false`          |
| `containerSecurityContext.capabilities.drop`        | List of capabilities to be dropped                                                                                                                                                                                | `["ALL"]`        |
| `containerSecurityContext.seccompProfile.type`      | Set container's Security Context seccomp profile                                                                                                                                                                  | `RuntimeDefault` |
| `resourcesPreset`                                   | Set container resources according to one common preset (allowed values: none, nano, micro, small, medium, large, xlarge, 2xlarge). This is ignored if resources is set (resources is recommended for production). | `small`          |
| `resources`                                         | Set container requests and limits for different resources like CPU or memory (essential for production workloads)                                                                                                 | `{}`             |
| `containerPorts.mongodb`                            | MongoDB(&reg;) container port                                                                                                                                                                                     | `27017`          |
| `livenessProbe.enabled`                             | Enable livenessProbe                                                                                                                                                                                              | `true`           |
| `livenessProbe.initialDelaySeconds`                 | Initial delay seconds for livenessProbe                                                                                                                                                                           | `30`             |
| `livenessProbe.periodSeconds`                       | Period seconds for livenessProbe                                                                                                                                                                                  | `20`             |
| `livenessProbe.timeoutSeconds`                      | Timeout seconds for livenessProbe                                                                                                                                                                                 | `10`             |
| `livenessProbe.failureThreshold`                    | Failure threshold for livenessProbe                                                                                                                                                                               | `6`              |
| `livenessProbe.successThreshold`                    | Success threshold for livenessProbe                                                                                                                                                                               | `1`              |
| `readinessProbe.enabled`                            | Enable readinessProbe                                                                                                                                                                                             | `true`           |
| `readinessProbe.initialDelaySeconds`                | Initial delay seconds for readinessProbe                                                                                                                                                                          | `5`              |
| `readinessProbe.periodSeconds`                      | Period seconds for readinessProbe                                                                                                                                                                                 | `10`             |
| `readinessProbe.timeoutSeconds`                     | Timeout seconds for readinessProbe                                                                                                                                                                                | `5`              |
| `readinessProbe.failureThreshold`                   | Failure threshold for readinessProbe                                                                                                                                                                              | `6`              |
| `readinessProbe.successThreshold`                   | Success threshold for readinessProbe                                                                                                                                                                              | `1`              |
| `startupProbe.enabled`                              | Enable startupProbe                                                                                                                                                                                               | `false`          |
| `startupProbe.initialDelaySeconds`                  | Initial delay seconds for startupProbe                                                                                                                                                                            | `5`              |
| `startupProbe.periodSeconds`                        | Period seconds for startupProbe                                                                                                                                                                                   | `20`             |
| `startupProbe.timeoutSeconds`                       | Timeout seconds for startupProbe                                                                                                                                                                                  | `10`             |
| `startupProbe.failureThreshold`                     | Failure threshold for startupProbe                                                                                                                                                                                | `30`             |
| `startupProbe.successThreshold`                     | Success threshold for startupProbe                                                                                                                                                                                | `1`              |
| `customLivenessProbe`                               | Override default liveness probe for MongoDB(&reg;) containers                                                                                                                                                     | `{}`             |
| `customReadinessProbe`                              | Override default readiness probe for MongoDB(&reg;) containers                                                                                                                                                    | `{}`             |
| `customStartupProbe`                                | Override default startup probe for MongoDB(&reg;) containers                                                                                                                                                      | `{}`             |
| `initContainers`                                    | Add additional init containers for the hidden node pod(s)                                                                                                                                                         | `[]`             |
| `sidecars`                                          | Add additional sidecar containers for the MongoDB(&reg;) pod(s)                                                                                                                                                   | `[]`             |
| `extraVolumeMounts`                                 | Optionally specify extra list of additional volumeMounts for the MongoDB(&reg;) container(s)                                                                                                                      | `[]`             |
| `extraVolumes`                                      | Optionally specify extra list of additional volumes to the MongoDB(&reg;) statefulset                                                                                                                             | `[]`             |
| `pdb.create`                                        | Enable/disable a Pod Disruption Budget creation for MongoDB(&reg;) pod(s)                                                                                                                                         | `true`           |
| `pdb.minAvailable`                                  | Minimum number/percentage of MongoDB(&reg;) pods that must still be available after the eviction                                                                                                                  | `""`             |
| `pdb.maxUnavailable`                                | Maximum number/percentage of MongoDB(&reg;) pods that may be made unavailable after the eviction. Defaults to `1` if both `pdb.minAvailable` and `pdb.maxUnavailable` are empty.                                  | `""`             |

### Traffic exposure parameters

| Name                                                          | Description                                                                                                                                                                                                                                                                 | Value                     |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `service.nameOverride`                                        | MongoDB(&reg;) service name                                                                                                                                                                                                                                                 | `""`                      |
| `service.type`                                                | Kubernetes Service type (only for standalone architecture)                                                                                                                                                                                                                  | `ClusterIP`               |
| `service.portName`                                            | MongoDB(&reg;) service port name (only for standalone architecture)                                                                                                                                                                                                         | `mongodb`                 |
| `service.ports.mongodb`                                       | MongoDB(&reg;) service port.                                                                                                                                                                                                                                                | `27017`                   |
| `service.nodePorts.mongodb`                                   | Port to bind to for NodePort and LoadBalancer service types (only for standalone architecture)                                                                                                                                                                              | `""`                      |
| `service.clusterIP`                                           | MongoDB(&reg;) service cluster IP (only for standalone architecture)                                                                                                                                                                                                        | `""`                      |
| `service.externalIPs`                                         | Specify the externalIP value ClusterIP service type (only for standalone architecture)                                                                                                                                                                                      | `[]`                      |
| `service.loadBalancerIP`                                      | loadBalancerIP for MongoDB(&reg;) Service (only for standalone architecture)                                                                                                                                                                                                | `""`                      |
| `service.loadBalancerClass`                                   | loadBalancerClass for MongoDB(&reg;) Service (only for standalone architecture)                                                                                                                                                                                             | `""`                      |
| `service.loadBalancerSourceRanges`                            | Address(es) that are allowed when service is LoadBalancer (only for standalone architecture)                                                                                                                                                                                | `[]`                      |
| `service.allocateLoadBalancerNodePorts`                       | Wheter to allocate node ports when service type is LoadBalancer                                                                                                                                                                                                             | `true`                    |
| `service.extraPorts`                                          | Extra ports to expose (normally used with the `sidecar` value)                                                                                                                                                                                                              | `[]`                      |
| `service.annotations`                                         | Provide any additional annotations that may be required                                                                                                                                                                                                                     | `{}`                      |
| `service.externalTrafficPolicy`                               | service external traffic policy (only for standalone architecture)                                                                                                                                                                                                          | `Local`                   |
| `service.sessionAffinity`                                     | Control where client requests go, to the same pod or round-robin                                                                                                                                                                                                            | `None`                    |
| `service.sessionAffinityConfig`                               | Additional settings for the sessionAffinity                                                                                                                                                                                                                                 | `{}`                      |
| `service.headless.annotations`                                | Annotations for the headless service.                                                                                                                                                                                                                                       | `{}`                      |
| `service.publishNotReadyAddresses`                            | Indicates that any agent which deals with endpoints for this Service should disregard any indications of ready/not-ready                                                                                                                                                    | `false`                   |
| `externalAccess.enabled`                                      | Enable Kubernetes external cluster access to MongoDB(&reg;) nodes (only for replicaset architecture)                                                                                                                                                                        | `false`                   |
| `externalAccess.autoDiscovery.enabled`                        | Enable using an init container to auto-detect external IPs by querying the K8s API                                                                                                                                                                                          | `false`                   |
| `externalAccess.autoDiscovery.image.registry`                 | Init container auto-discovery image registry                                                                                                                                                                                                                                | `REGISTRY_NAME`           |
| `externalAccess.autoDiscovery.image.repository`               | Init container auto-discovery image repository                                                                                                                                                                                                                              | `REPOSITORY_NAME/kubectl` |
| `externalAccess.autoDiscovery.image.digest`                   | Init container auto-discovery image digest in the way sha256:aa.... Please note this parameter, if set, will override the tag                                                                                                                                               | `""`                      |
| `externalAccess.autoDiscovery.image.pullPolicy`               | Init container auto-discovery image pull policy                                                                                                                                                                                                                             | `IfNotPresent`            |
| `externalAccess.autoDiscovery.image.pullSecrets`              | Init container auto-discovery image pull secrets                                                                                                                                                                                                                            | `[]`                      |
| `externalAccess.autoDiscovery.resourcesPreset`                | Set container resources according to one common preset (allowed values: none, nano, micro, small, medium, large, xlarge, 2xlarge). This is ignored if externalAccess.autoDiscovery.resources is set (externalAccess.autoDiscovery.resources is recommended for production). | `nano`                    |
| `externalAccess.autoDiscovery.resources`                      | Set container requests and limits for different resources like CPU or memory (essential for production workloads)                                                                                                                                                           | `{}`                      |
| `externalAccess.dnsCheck.image.registry`                      | Init container dns-check image registry                                                                                                                                                                                                                                     | `REGISTRY_NAME`           |
| `externalAccess.dnsCheck.image.repository`                    | Init container dns-check image repository                                                                                                                                                                                                                                   | `REPOSITORY_NAME/kubectl` |
| `externalAccess.dnsCheck.image.digest`                        | Init container dns-check image digest in the way sha256:aa.... Please note this parameter, if set, will override the tag                                                                                                                                                    | `""`                      |
| `externalAccess.dnsCheck.image.pullPolicy`                    | Init container dns-check image pull policy                                                                                                                                                                                                                                  | `IfNotPresent`            |
| `externalAccess.dnsCheck.image.pullSecrets`                   | Init container dns-check image pull secrets                                                                                                                                                                                                                                 | `[]`                      |
| `externalAccess.dnsCheck.resourcesPreset`                     | Set container resources according to one common preset (allowed values: none, nano, micro, small, medium, large, xlarge, 2xlarge). This is ignored if externalAccess.autoDiscovery.resources is set (externalAccess.autoDiscovery.resources is recommended for production). | `nano`                    |
| `externalAccess.dnsCheck.resources`                           | Set container requests and limits for different resources like CPU or memory (essential for production workloads)                                                                                                                                                           | `{}`                      |
| `externalAccess.externalMaster.enabled`                       | Use external master for bootstrapping                                                                                                                                                                                                                                       | `false`                   |
| `externalAccess.externalMaster.host`                          | External master host to bootstrap from                                                                                                                                                                                                                                      | `""`                      |
| `externalAccess.externalMaster.port`                          | Port for MongoDB(&reg;) service external master host                                                                                                                                                                                                                        | `27017`                   |
| `externalAccess.service.type`                                 | Kubernetes Service type for external access. Allowed values: NodePort, LoadBalancer or ClusterIP                                                                                                                                                                            | `LoadBalancer`            |
| `externalAccess.service.portName`                             | MongoDB(&reg;) port name used for external access when service type is LoadBalancer                                                                                                                                                                                         | `mongodb`                 |
| `externalAccess.service.ports.mongodb`                        | MongoDB(&reg;) port used for external access when service type is LoadBalancer                                                                                                                                                                                              | `27017`                   |
| `externalAccess.service.loadBalancerIPs`                      | Array of load balancer IPs for MongoDB(&reg;) nodes                                                                                                                                                                                                                         | `[]`                      |
| `externalAccess.service.publicNames`                          | Array of public names. The size should be equal to the number of replicas.                                                                                                                                                                                                  | `[]`                      |
| `externalAccess.service.loadBalancerClass`                    | loadBalancerClass when service type is LoadBalancer                                                                                                                                                                                                                         | `""`                      |
| `externalAccess.service.loadBalancerSourceRanges`             | Address(es) that are allowed when service is LoadBalancer                                                                                                                                                                                                                   | `[]`                      |
| `externalAccess.service.allocateLoadBalancerNodePorts`        | Whether to allocate node ports when service type is LoadBalancer                                                                                                                                                                                                            | `true`                    |
| `externalAccess.service.externalTrafficPolicy`                | MongoDB(&reg;) service external traffic policy                                                                                                                                                                                                                              | `Local`                   |
| `externalAccess.service.nodePorts`                            | Array of node ports used to configure MongoDB(&reg;) advertised hostname when service type is NodePort                                                                                                                                                                      | `[]`                      |
| `externalAccess.service.domain`                               | Domain or external IP used to configure MongoDB(&reg;) advertised hostname when service type is NodePort                                                                                                                                                                    | `""`                      |
| `externalAccess.service.extraPorts`                           | Extra ports to expose (normally used with the `sidecar` value)                                                                                                                                                                                                              | `[]`                      |
| `externalAccess.service.annotations`                          | Service annotations for external access. These annotations are common for all services created.                                                                                                                                                                             | `{}`                      |
| `externalAccess.service.annotationsList`                      | Service annotations for eache external service. This value contains a list allowing different annotations per each external service.                                                                                                                                        | `[]`                      |
| `externalAccess.service.sessionAffinity`                      | Control where client requests go, to the same pod or round-robin                                                                                                                                                                                                            | `None`                    |
| `externalAccess.service.sessionAffinityConfig`                | Additional settings for the sessionAffinity                                                                                                                                                                                                                                 | `{}`                      |
| `externalAccess.hidden.enabled`                               | Enable Kubernetes external cluster access to MongoDB(&reg;) hidden nodes                                                                                                                                                                                                    | `false`                   |
| `externalAccess.hidden.service.type`                          | Kubernetes Service type for external access. Allowed values: NodePort or LoadBalancer                                                                                                                                                                                       | `LoadBalancer`            |
| `externalAccess.hidden.service.portName`                      | MongoDB(&reg;) port name used for external access when service type is LoadBalancer                                                                                                                                                                                         | `mongodb`                 |
| `externalAccess.hidden.service.ports.mongodb`                 | MongoDB(&reg;) port used for external access when service type is LoadBalancer                                                                                                                                                                                              | `27017`                   |
| `externalAccess.hidden.service.loadBalancerIPs`               | Array of load balancer IPs for MongoDB(&reg;) nodes                                                                                                                                                                                                                         | `[]`                      |
| `externalAccess.hidden.service.loadBalancerClass`             | loadBalancerClass when service type is LoadBalancer                                                                                                                                                                                                                         | `""`                      |
| `externalAccess.hidden.service.loadBalancerSourceRanges`      | Address(es) that are allowed when service is LoadBalancer                                                                                                                                                                                                                   | `[]`                      |
| `externalAccess.hidden.service.allocateLoadBalancerNodePorts` | Wheter to allocate node ports when service type is LoadBalancer                                                                                                                                                                                                             | `true`                    |
| `externalAccess.hidden.service.externalTrafficPolicy`         | MongoDB(&reg;) service external traffic policy                                                                                                                                                                                                                              | `Local`                   |
| `externalAccess.hidden.service.nodePorts`                     | Array of node ports used to configure MongoDB(&reg;) advertised hostname when service type is NodePort. Length must be the same as replicaCount                                                                                                                             | `[]`                      |
| `externalAccess.hidden.service.domain`                        | Domain or external IP used to configure MongoDB(&reg;) advertised hostname when service type is NodePort                                                                                                                                                                    | `""`                      |
| `externalAccess.hidden.service.extraPorts`                    | Extra ports to expose (normally used with the `sidecar` value)                                                                                                                                                                                                              | `[]`                      |
| `externalAccess.hidden.service.annotations`                   | Service annotations for external access                                                                                                                                                                                                                                     | `{}`                      |
| `externalAccess.hidden.service.sessionAffinity`               | Control where client requests go, to the same pod or round-robin                                                                                                                                                                                                            | `None`                    |
| `externalAccess.hidden.service.sessionAffinityConfig`         | Additional settings for the sessionAffinity                                                                                                                                                                                                                                 | `{}`                      |

### Password update job

| Name                                                                  | Description                                                                                                                                                                                                                                           | Value            |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `passwordUpdateJob.enabled`                                           | Enable password update job                                                                                                                                                                                                                            | `false`          |
| `passwordUpdateJob.backoffLimit`                                      | set backoff limit of the job                                                                                                                                                                                                                          | `10`             |
| `passwordUpdateJob.command`                                           | Override default container command on mysql Primary container(s) (useful when using custom images)                                                                                                                                                    | `[]`             |
| `passwordUpdateJob.args`                                              | Override default container args on mysql Primary container(s) (useful when using custom images)                                                                                                                                                       | `[]`             |
| `passwordUpdateJob.extraCommands`                                     | Extra commands to pass to the generation job                                                                                                                                                                                                          | `""`             |
| `passwordUpdateJob.previousPasswords.rootPassword`                    | Previous root password (set if the password secret was already changed)                                                                                                                                                                               | `""`             |
| `passwordUpdateJob.previousPasswords.existingSecret`                  | Name of a secret containing the previous passwords (set if the password secret was already changed)                                                                                                                                                   | `""`             |
| `passwordUpdateJob.containerSecurityContext.enabled`                  | Enabled containers' Security Context                                                                                                                                                                                                                  | `true`           |
| `passwordUpdateJob.containerSecurityContext.seLinuxOptions`           | Set SELinux options in container                                                                                                                                                                                                                      | `{}`             |
| `passwordUpdateJob.containerSecurityContext.runAsUser`                | Set containers' Security Context runAsUser                                                                                                                                                                                                            | `1001`           |
| `passwordUpdateJob.containerSecurityContext.runAsGroup`               | Set containers' Security Context runAsGroup                                                                                                                                                                                                           | `1001`           |
| `passwordUpdateJob.containerSecurityContext.runAsNonRoot`             | Set container's Security Context runAsNonRoot                                                                                                                                                                                                         | `true`           |
| `passwordUpdateJob.containerSecurityContext.privileged`               | Set container's Security Context privileged                                                                                                                                                                                                           | `false`          |
| `passwordUpdateJob.containerSecurityContext.readOnlyRootFilesystem`   | Set container's Security Context readOnlyRootFilesystem                                                                                                                                                                                               | `true`           |
| `passwordUpdateJob.containerSecurityContext.allowPrivilegeEscalation` | Set container's Security Context allowPrivilegeEscalation                                                                                                                                                                                             | `false`          |
| `passwordUpdateJob.containerSecurityContext.capabilities.drop`        | List of capabilities to be dropped                                                                                                                                                                                                                    | `["ALL"]`        |
| `passwordUpdateJob.containerSecurityContext.seccompProfile.type`      | Set container's Security Context seccomp profile                                                                                                                                                                                                      | `RuntimeDefault` |
| `passwordUpdateJob.podSecurityContext.enabled`                        | Enabled credential init job pods' Security Context                                                                                                                                                                                                    | `true`           |
| `passwordUpdateJob.podSecurityContext.fsGroupChangePolicy`            | Set filesystem group change policy                                                                                                                                                                                                                    | `Always`         |
| `passwordUpdateJob.podSecurityContext.sysctls`                        | Set kernel settings using the sysctl interface                                                                                                                                                                                                        | `[]`             |
| `passwordUpdateJob.podSecurityContext.supplementalGroups`             | Set filesystem extra groups                                                                                                                                                                                                                           | `[]`             |
| `passwordUpdateJob.podSecurityContext.fsGroup`                        | Set credential init job pod's Security Context fsGroup                                                                                                                                                                                                | `1001`           |
| `passwordUpdateJob.extraEnvVars`                                      | Array containing extra env vars to configure the credential init job                                                                                                                                                                                  | `[]`             |
| `passwordUpdateJob.extraEnvVarsCM`                                    | ConfigMap containing extra env vars to configure the credential init job                                                                                                                                                                              | `""`             |
| `passwordUpdateJob.extraEnvVarsSecret`                                | Secret containing extra env vars to configure the credential init job (in case of sensitive data)                                                                                                                                                     | `""`             |
| `passwordUpdateJob.extraVolumes`                                      | Optionally specify extra list of additional volumes for the credential init job                                                                                                                                                                       | `[]`             |
| `passwordUpdateJob.extraVolumeMounts`                                 | Array of extra volume mounts to be added to the jwt Container (evaluated as template). Normally used with `extraVolumes`.                                                                                                                             | `[]`             |
| `passwordUpdateJob.initContainers`                                    | Add additional init containers for the mysql Primary pod(s)                                                                                                                                                                                           | `[]`             |
| `passwordUpdateJob.resourcesPreset`                                   | Set container resources according to one common preset (allowed values: none, nano, micro, small, medium, large, xlarge, 2xlarge). This is ignored if passwordUpdateJob.resources is set (passwordUpdateJob.resources is recommended for production). | `micro`          |
| `passwordUpdateJob.resources`                                         | Set container requests and limits for different resources like CPU or memory (essential for production workloads)                                                                                                                                     | `{}`             |
| `passwordUpdateJob.customLivenessProbe`                               | Custom livenessProbe that overrides the default one                                                                                                                                                                                                   | `{}`             |
| `passwordUpdateJob.customReadinessProbe`                              | Custom readinessProbe that overrides the default one                                                                                                                                                                                                  | `{}`             |
| `passwordUpdateJob.customStartupProbe`                                | Custom startupProbe that overrides the default one                                                                                                                                                                                                    | `{}`             |
| `passwordUpdateJob.automountServiceAccountToken`                      | Mount Service Account token in pod                                                                                                                                                                                                                    | `false`          |
| `passwordUpdateJob.hostAliases`                                       | Add deployment host aliases                                                                                                                                                                                                                           | `[]`             |
| `passwordUpdateJob.annotations`                                       | Add annotations to the job                                                                                                                                                                                                                            | `{}`             |
| `passwordUpdateJob.podLabels`                                         | Additional pod labels                                                                                                                                                                                                                                 | `{}`             |
| `passwordUpdateJob.podAnnotations`                                    | Additional pod annotations                                                                                                                                                                                                                            | `{}`             |

### Network policy parameters

| Name                                               | Description                                                                                                                           | Value               |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `networkPolicy.enabled`                            | Specifies whether a NetworkPolicy should be created                                                                                   | `true`              |
| `networkPolicy.allowExternal`                      | Don't require server label for connections                                                                                            | `true`              |
| `networkPolicy.allowExternalEgress`                | Allow the pod to access any range of port and all destinations.                                                                       | `true`              |
| `networkPolicy.addExternalClientAccess`            | Allow access from pods with client label set to "true". Ignored if `networkPolicy.allowExternal` is true.                             | `true`              |
| `networkPolicy.extraIngress`                       | Add extra ingress rules to the NetworkPolicy                                                                                          | `[]`                |
| `networkPolicy.extraEgress`                        | Add extra ingress rules to the NetworkPolicy                                                                                          | `[]`                |
| `networkPolicy.ingressPodMatchLabels`              | Labels to match to allow traffic from other pods. Ignored if `networkPolicy.allowExternal` is true.                                   | `{}`                |
| `networkPolicy.ingressNSMatchLabels`               | Labels to match to allow traffic from other namespaces. Ignored if `networkPolicy.allowExternal` is true.                             | `{}`                |
| `networkPolicy.ingressNSPodMatchLabels`            | Pod labels to match to allow traffic from other namespaces. Ignored if `networkPolicy.allowExternal` is true.                         | `{}`                |
| `persistence.enabled`                              | Enable MongoDB(&reg;) data persistence using PVC                                                                                      | `true`              |
| `persistence.name`                                 | Name of the PVC and mounted volume                                                                                                    | `datadir`           |
| `persistence.medium`                               | Provide a medium for `emptyDir` volumes.                                                                                              | `""`                |
| `persistence.existingClaim`                        | Provide an existing `PersistentVolumeClaim` (only when `architecture=standalone`)                                                     | `""`                |
| `persistence.resourcePolicy`                       | Setting it to "keep" to avoid removing PVCs during a helm delete operation. Leaving it empty will delete PVCs after the chart deleted | `""`                |
| `persistence.storageClass`                         | PVC Storage Class for MongoDB(&reg;) data volume                                                                                      | `""`                |
| `persistence.accessModes`                          | PV Access Mode                                                                                                                        | `["ReadWriteOnce"]` |
| `persistence.size`                                 | PVC Storage Request for MongoDB(&reg;) data volume                                                                                    | `8Gi`               |
| `persistence.annotations`                          | PVC annotations                                                                                                                       | `{}`                |
| `persistence.labels`                               | PVC labels                                                                                                                            | `{}`                |
| `persistence.mountPath`                            | Path to mount the volume at                                                                                                           | `/bitnami/mongodb`  |
| `persistence.subPath`                              | Subdirectory of the volume to mount at                                                                                                | `""`                |
| `persistence.volumeClaimTemplates.selector`        | A label query over volumes to consider for binding (e.g. when using local volumes)                                                    | `{}`                |
| `persistence.volumeClaimTemplates.requests`        | Custom PVC requests attributes                                                                                                        | `{}`                |
| `persistence.volumeClaimTemplates.dataSource`      | Add dataSource to the VolumeClaimTemplate                                                                                             | `{}`                |
| `persistentVolumeClaimRetentionPolicy.enabled`     | Enable Persistent volume retention policy for MongoDB(&reg;) Statefulset                                                              | `false`             |
| `persistentVolumeClaimRetentionPolicy.whenScaled`  | Volume retention behavior when the replica count of the StatefulSet is reduced                                                        | `Retain`            |
| `persistentVolumeClaimRetentionPolicy.whenDeleted` | Volume retention behavior that applies when the StatefulSet is deleted                                                                | `Retain`            |

### Backup parameters

| Name                                                               | Description                                                                                                                                                                                                       | Value               |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `backup.enabled`                                                   | Enable the logical dump of the database "regularly"                                                                                                                                                               | `false`             |
| `backup.cronjob.schedule`                                          | Set the cronjob parameter schedule                                                                                                                                                                                | `@daily`            |
| `backup.cronjob.timeZone`                                          | Set the cronjob parameter timeZone                                                                                                                                                                                | `""`                |
| `backup.cronjob.concurrencyPolicy`                                 | Set the cronjob parameter concurrencyPolicy                                                                                                                                                                       | `Allow`             |
| `backup.cronjob.failedJobsHistoryLimit`                            | Set the cronjob parameter failedJobsHistoryLimit                                                                                                                                                                  | `1`                 |
| `backup.cronjob.successfulJobsHistoryLimit`                        | Set the cronjob parameter successfulJobsHistoryLimit                                                                                                                                                              | `3`                 |
| `backup.cronjob.startingDeadlineSeconds`                           | Set the cronjob parameter startingDeadlineSeconds                                                                                                                                                                 | `""`                |
| `backup.cronjob.ttlSecondsAfterFinished`                           | Set the cronjob parameter ttlSecondsAfterFinished                                                                                                                                                                 | `""`                |
| `backup.cronjob.restartPolicy`                                     | Set the cronjob parameter restartPolicy                                                                                                                                                                           | `OnFailure`         |
| `backup.cronjob.backoffLimit`                                      | Set the cronjob parameter backoffLimit                                                                                                                                                                            | `6`                 |
| `backup.cronjob.serviceAccount.name`                               | Set the cronjob parameter serviceAccountName. If you change from the default values make sure that the SA already exists.                                                                                         | `default`           |
| `backup.cronjob.containerSecurityContext.enabled`                  | Enabled containers' Security Context                                                                                                                                                                              | `true`              |
| `backup.cronjob.containerSecurityContext.seLinuxOptions`           | Set SELinux options in container                                                                                                                                                                                  | `{}`                |
| `backup.cronjob.containerSecurityContext.runAsUser`                | Set containers' Security Context runAsUser                                                                                                                                                                        | `1001`              |
| `backup.cronjob.containerSecurityContext.runAsGroup`               | Set containers' Security Context runAsGroup                                                                                                                                                                       | `1001`              |
| `backup.cronjob.containerSecurityContext.runAsNonRoot`             | Set container's Security Context runAsNonRoot                                                                                                                                                                     | `true`              |
| `backup.cronjob.containerSecurityContext.privileged`               | Set container's Security Context privileged                                                                                                                                                                       | `false`             |
| `backup.cronjob.containerSecurityContext.readOnlyRootFilesystem`   | Set container's Security Context readOnlyRootFilesystem                                                                                                                                                           | `true`              |
| `backup.cronjob.containerSecurityContext.allowPrivilegeEscalation` | Set container's Security Context allowPrivilegeEscalation                                                                                                                                                         | `false`             |
| `backup.cronjob.containerSecurityContext.capabilities.drop`        | List of capabilities to be dropped                                                                                                                                                                                | `["ALL"]`           |
| `backup.cronjob.containerSecurityContext.seccompProfile.type`      | Set container's Security Context seccomp profile                                                                                                                                                                  | `RuntimeDefault`    |
| `backup.cronjob.resourcesPreset`                                   | Set container resources according to one common preset (allowed values: none, nano, micro, small, medium, large, xlarge, 2xlarge). This is ignored if resources is set (resources is recommended for production). | `none`              |
| `backup.cronjob.resources`                                         | Set container requests and limits for different resources like CPU or memory (essential for production workloads)                                                                                                 | `{}`                |
| `backup.cronjob.command`                                           | Set backup container's command to run                                                                                                                                                                             | `[]`                |
| `backup.cronjob.labels`                                            | Set the cronjob labels                                                                                                                                                                                            | `{}`                |
| `backup.cronjob.annotations`                                       | Set the cronjob annotations                                                                                                                                                                                       | `{}`                |
| `backup.cronjob.storage.existingClaim`                             | Provide an existing `PersistentVolumeClaim` (only when `architecture=standalone`)                                                                                                                                 | `""`                |
| `backup.cronjob.storage.resourcePolicy`                            | Setting it to "keep" to avoid removing PVCs during a helm delete operation. Leaving it empty will delete PVCs after the chart deleted                                                                             | `""`                |
| `backup.cronjob.storage.storageClass`                              | PVC Storage Class for the backup data volume                                                                                                                                                                      | `""`                |
| `backup.cronjob.storage.accessModes`                               | PV Access Mode                                                                                                                                                                                                    | `["ReadWriteOnce"]` |
| `backup.cronjob.storage.size`                                      | PVC Storage Request for the backup data volume                                                                                                                                                                    | `8Gi`               |
| `backup.cronjob.storage.annotations`                               | PVC annotations                                                                                                                                                                                                   | `{}`                |
| `backup.cronjob.storage.mountPath`                                 | Path to mount the volume at                                                                                                                                                                                       | `/backup/mongodb`   |
| `backup.cronjob.storage.subPath`                                   | Subdirectory of the volume to mount at                                                                                                                                                                            | `""`                |
| `backup.cronjob.storage.volumeClaimTemplates.selector`             | A label query over volumes to consider for binding (e.g. when using local volumes)                                                                                                                                | `{}`                |

### RBAC parameters

| Name                                          | Description                                                                                                                                 | Value   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `serviceAccount.create`                       | Enable creation of ServiceAccount for MongoDB(&reg;) pods                                                                                   | `true`  |
| `serviceAccount.name`                         | Name of the created serviceAccount                                                                                                          | `""`    |
| `serviceAccount.annotations`                  | Additional Service Account annotations                                                                                                      | `{}`    |
| `serviceAccount.automountServiceAccountToken` | Allows auto mount of ServiceAccountToken on the serviceAccount created                                                                      | `false` |
| `rbac.create`                                 | Whether to create & use RBAC resources or not                                                                                               | `false` |
| `rbac.rules`                                  | Custom rules to create following the role specification                                                                                     | `[]`    |
| `podSecurityPolicy.create`                    | Whether to create a PodSecurityPolicy. WARNING: PodSecurityPolicy is deprecated in Kubernetes v1.21 or later, unavailable in v1.25 or later | `false` |
| `podSecurityPolicy.allowPrivilegeEscalation`  | Enable privilege escalation                                                                                                                 | `false` |
| `podSecurityPolicy.privileged`                | Allow privileged                                                                                                                            | `false` |
| `podSecurityPolicy.spec`                      | Specify the full spec to use for Pod Security Policy                                                                                        | `{}`    |

### Volume Permissions parameters

| Name                                               | Description                                                                                                                                                                                                                                           | Value                      |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `volumePermissions.enabled`                        | Enable init container that changes the owner and group of the persistent volume(s) mountpoint to `runAsUser:fsGroup`                                                                                                                                  | `false`                    |
| `volumePermissions.image.registry`                 | Init container volume-permissions image registry                                                                                                                                                                                                      | `REGISTRY_NAME`            |
| `volumePermissions.image.repository`               | Init container volume-permissions image repository                                                                                                                                                                                                    | `REPOSITORY_NAME/os-shell` |
| `volumePermissions.image.digest`                   | Init container volume-permissions image digest in the way sha256:aa.... Please note this parameter, if set, will override the tag                                                                                                                     | `""`                       |
| `volumePermissions.image.pullPolicy`               | Init container volume-permissions image pull policy                                                                                                                                                                                                   | `IfNotPresent`             |
| `volumePermissions.image.pullSecrets`              | Specify docker-registry secret names as an array                                                                                                                                                                                                      | `[]`                       |
| `volumePermissions.resourcesPreset`                | Set container resources according to one common preset (allowed values: none, nano, micro, small, medium, large, xlarge, 2xlarge). This is ignored if volumePermissions.resources is set (volumePermissions.resources is recommended for production). | `nano`                     |
| `volumePermissions.resources`                      | Set container requests and limits for different resources like CPU or memory (essential for production workloads)                                                                                                                                     | `{}`                       |
| `volumePermissions.securityContext.seLinuxOptions` | Set SELinux options in container                                                                                                                                                                                                                      | `{}`                       |
| `volumePermissions.securityContext.runAsUser`      | User ID for the volumePermissions container                                                                                                                                                                                                           | `0`                        |

### Arbiter parameters

| Name                                                        | Description                                                                                                                                                                                                                       | Value            |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `arbiter.enabled`                                           | Enable deploying the arbiter                                                                                                                                                                                                      | `true`           |
| `arbiter.automountServiceAccountToken`                      | Mount Service Account token in pod                                                                                                                                                                                                | `false`          |
| `arbiter.hostAliases`                                       | Add deployment host aliases                                                                                                                                                                                                       | `[]`             |
| `arbiter.configuration`                                     | Arbiter configuration file to be used                                                                                                                                                                                             | `""`             |
| `arbiter.existingConfigmap`                                 | Name of existing ConfigMap with Arbiter configuration                                                                                                                                                                             | `""`             |
| `arbiter.command`                                           | Override default container command (useful when using custom images)                                                                                                                                                              | `[]`             |
| `arbiter.args`                                              | Override default container args (useful when using custom images)                                                                                                                                                                 | `[]`             |
| `arbiter.extraFlags`                                        | Arbiter additional command line flags                                                                                                                                                                                             | `[]`             |
| `arbiter.extraEnvVars`                                      | Extra environment variables to add to Arbiter pods                                                                                                                                                                                | `[]`             |
| `arbiter.extraEnvVarsCM`                                    | Name of existing ConfigMap containing extra env vars                                                                                                                                                                              | `""`             |
| `arbiter.extraEnvVarsSecret`                                | Name of existing Secret containing extra env vars (in case of sensitive data)                                                                                                                                                     | `""`             |
| `arbiter.annotations`                                       | Additional labels to be added to the Arbiter statefulset                                                                                                                                                                          | `{}`             |
| `arbiter.labels`                                            | Annotations to be added to the Arbiter statefulset                                                                                                                                                                                | `{}`             |
| `arbiter.topologySpreadConstraints`                         | MongoDB(&reg;) Spread Constraints for arbiter Pods                                                                                                                                                                                | `[]`             |
| `arbiter.lifecycleHooks`                                    | LifecycleHook for the Arbiter container to automate configuration before or after startup                                                                                                                                         | `{}`             |
| `arbiter.terminationGracePeriodSeconds`                     | Arbiter Termination Grace Period                                                                                                                                                                                                  | `""`             |
| `arbiter.updateStrategy.type`                               | Strategy that will be employed to update Pods in the StatefulSet                                                                                                                                                                  | `RollingUpdate`  |
| `arbiter.podManagementPolicy`                               | Pod management policy for MongoDB(&reg;)                                                                                                                                                                                          | `OrderedReady`   |
| `arbiter.schedulerName`                                     | Name of the scheduler (other than default) to dispatch pods                                                                                                                                                                       | `""`             |
| `arbiter.podAffinityPreset`                                 | Arbiter Pod affinity preset. Ignored if `affinity` is set. Allowed values: `soft` or `hard`                                                                                                                                       | `""`             |
| `arbiter.podAntiAffinityPreset`                             | Arbiter Pod anti-affinity preset. Ignored if `affinity` is set. Allowed values: `soft` or `hard`                                                                                                                                  | `soft`           |
| `arbiter.nodeAffinityPreset.type`                           | Arbiter Node affinity preset type. Ignored if `affinity` is set. Allowed values: `soft` or `hard`                                                                                                                                 | `""`             |
| `arbiter.nodeAffinityPreset.key`                            | Arbiter Node label key to match Ignored if `affinity` is set.                                                                                                                                                                     | `""`             |
| `arbiter.nodeAffinityPreset.values`                         | Arbiter Node label values to match. Ignored if `affinity` is set.                                                                                                                                                                 | `[]`             |
| `arbiter.affinity`                                          | Arbiter Affinity for pod assignment                                                                                                                                                                                               | `{}`             |
| `arbiter.nodeSelector`                                      | Arbiter Node labels for pod assignment                                                                                                                                                                                            | `{}`             |
| `arbiter.tolerations`                                       | Arbiter Tolerations for pod assignment                                                                                                                                                                                            | `[]`             |
| `arbiter.podLabels`                                         | Arbiter pod labels                                                                                                                                                                                                                | `{}`             |
| `arbiter.podAnnotations`                                    | Arbiter Pod annotations                                                                                                                                                                                                           | `{}`             |
| `arbiter.priorityClassName`                                 | Name of the existing priority class to be used by Arbiter pod(s)                                                                                                                                                                  | `""`             |
| `arbiter.runtimeClassName`                                  | Name of the runtime class to be used by Arbiter pod(s)                                                                                                                                                                            | `""`             |
| `arbiter.podSecurityContext.enabled`                        | Enable Arbiter pod(s)' Security Context                                                                                                                                                                                           | `true`           |
| `arbiter.podSecurityContext.fsGroupChangePolicy`            | Set filesystem group change policy                                                                                                                                                                                                | `Always`         |
| `arbiter.podSecurityContext.supplementalGroups`             | Set filesystem extra groups                                                                                                                                                                                                       | `[]`             |
| `arbiter.podSecurityContext.fsGroup`                        | Group ID for the volumes of the Arbiter pod(s)                                                                                                                                                                                    | `1001`           |
| `arbiter.podSecurityContext.sysctls`                        | sysctl settings of the Arbiter pod(s)'                                                                                                                                                                                            | `[]`             |
| `arbiter.containerSecurityContext.enabled`                  | Enabled containers' Security Context                                                                                                                                                                                              | `true`           |
| `arbiter.containerSecurityContext.seLinuxOptions`           | Set SELinux options in container                                                                                                                                                                                                  | `{}`             |
| `arbiter.containerSecurityContext.runAsUser`                | Set containers' Security Context runAsUser                                                                                                                                                                                        | `1001`           |
| `arbiter.containerSecurityContext.runAsGroup`               | Set containers' Security Context runAsGroup                                                                                                                                                                                       | `1001`           |
| `arbiter.containerSecurityContext.runAsNonRoot`             | Set container's Security Context runAsNonRoot                                                                                                                                                                                     | `true`           |
| `arbiter.containerSecurityContext.privileged`               | Set container's Security Context privileged                                                                                                                                                                                       | `false`          |
| `arbiter.containerSecurityContext.readOnlyRootFilesystem`   | Set container's Security Context readOnlyRootFilesystem                                                                                                                                                                           | `true`           |
| `arbiter.containerSecurityContext.allowPrivilegeEscalation` | Set container's Security Context allowPrivilegeEscalation                                                                                                                                                                         | `false`          |
| `arbiter.containerSecurityContext.capabilities.drop`        | List of capabilities to be dropped                                                                                                                                                                                                | `["ALL"]`        |
| `arbiter.containerSecurityContext.seccompProfile.type`      | Set container's Security Context seccomp profile                                                                                                                                                                                  | `RuntimeDefault` |
| `arbiter.resourcesPreset`                                   | Set container resources according to one common preset (allowed values: none, nano, micro, small, medium, large, xlarge, 2xlarge). This is ignored if arbiter.resources is set (arbiter.resources is recommended for production). | `small`          |
| `arbiter.resources`                                         | Set container requests and limits for different resources like CPU or memory (essential for production workloads)                                                                                                                 | `{}`             |
| `arbiter.containerPorts.mongodb`                            | MongoDB(&reg;) arbiter container port                                                                                                                                                                                             | `27017`          |
| `arbiter.livenessProbe.enabled`                             | Enable livenessProbe                                                                                                                                                                                                              | `true`           |
| `arbiter.livenessProbe.initialDelaySeconds`                 | Initial delay seconds for livenessProbe                                                                                                                                                                                           | `30`             |
| `arbiter.livenessProbe.periodSeconds`                       | Period seconds for livenessProbe                                                                                                                                                                                                  | `20`             |
| `arbiter.livenessProbe.timeoutSeconds`                      | Timeout seconds for livenessProbe                                                                                                                                                                                                 | `10`             |
| `arbiter.livenessProbe.failureThreshold`                    | Failure threshold for livenessProbe                                                                                                                                                                                               | `6`              |
| `arbiter.livenessProbe.successThreshold`                    | Success threshold for livenessProbe                                                                                                                                                                                               | `1`              |
| `arbiter.readinessProbe.enabled`                            | Enable readinessProbe                                                                                                                                                                                                             | `true`           |
| `arbiter.readinessProbe.initialDelaySeconds`                | Initial delay seconds for readinessProbe                                                                                                                                                                                          | `5`              |
| `arbiter.readinessProbe.periodSeconds`                      | Period seconds for readinessProbe                                                                                                                                                                                                 | `20`             |
| `arbiter.readinessProbe.timeoutSeconds`                     | Timeout seconds for readinessProbe                                                                                                                                                                                                | `10`             |
| `arbiter.readinessProbe.failureThreshold`                   | Failure threshold for readinessProbe                                                                                                                                                                                              | `6`              |
| `arbiter.readinessProbe.successThreshold`                   | Success threshold for readinessProbe                                                                                                                                                                                              | `1`              |
| `arbiter.startupProbe.enabled`                              | Enable startupProbe                                                                                                                                                                                                               | `false`          |
| `arbiter.startupProbe.initialDelaySeconds`                  | Initial delay seconds for startupProbe                                                                                                                                                                                            | `5`              |
| `arbiter.startupProbe.periodSeconds`                        | Period seconds for startupProbe                                                                                                                                                                                                   | `10`             |
| `arbiter.startupProbe.timeoutSeconds`                       | Timeout seconds for startupProbe                                                                                                                                                                                                  | `5`              |
| `arbiter.startupProbe.failureThreshold`                     | Failure threshold for startupProbe                                                                                                                                                                                                | `30`             |
| `arbiter.startupProbe.successThreshold`                     | Success threshold for startupProbe                                                                                                                                                                                                | `1`              |
| `arbiter.customLivenessProbe`                               | Override default liveness probe for Arbiter containers                                                                                                                                                                            | `{}`             |
| `arbiter.customReadinessProbe`                              | Override default readiness probe for Arbiter containers                                                                                                                                                                           | `{}`             |
| `arbiter.customStartupProbe`                                | Override default startup probe for Arbiter containers                                                                                                                                                                             | `{}`             |
| `arbiter.initContainers`                                    | Add additional init containers for the Arbiter pod(s)                                                                                                                                                                             | `[]`             |
| `arbiter.sidecars`                                          | Add additional sidecar containers for the Arbiter pod(s)                                                                                                                                                                          | `[]`             |
| `arbiter.extraVolumeMounts`                                 | Optionally specify extra list of additional volumeMounts for the Arbiter container(s)                                                                                                                                             | `[]`             |
| `arbiter.extraVolumes`                                      | Optionally specify extra list of additional volumes to the Arbiter statefulset                                                                                                                                                    | `[]`             |
| `arbiter.pdb.create`                                        | Enable/disable a Pod Disruption Budget creation for Arbiter pod(s)                                                                                                                                                                | `true`           |
| `arbiter.pdb.minAvailable`                                  | Minimum number/percentage of Arbiter pods that should remain scheduled                                                                                                                                                            | `""`             |
| `arbiter.pdb.maxUnavailable`                                | Maximum number/percentage of Arbiter pods that may be made unavailable. Defaults to `1` if both `arbiter.pdb.minAvailable` and `arbiter.pdb.maxUnavailable` are empty.                                                            | `""`             |
| `arbiter.service.nameOverride`                              | The arbiter service name                                                                                                                                                                                                          | `""`             |
| `arbiter.service.ports.mongodb`                             | MongoDB(&reg;) service port                                                                                                                                                                                                       | `27017`          |
| `arbiter.service.extraPorts`                                | Extra ports to expose (normally used with the `sidecar` value)                                                                                                                                                                    | `[]`             |
| `arbiter.service.annotations`                               | Provide any additional annotations that may be required                                                                                                                                                                           | `{}`             |
| `arbiter.service.headless.annotations`                      | Annotations for the headless service.                                                                                                                                                                                             | `{}`             |

### Hidden Node parameters

| Name                                                       | Description                                                                                                                                                                                                                     | Value               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `hidden.enabled`                                           | Enable deploying the hidden nodes                                                                                                                                                                                               | `false`             |
| `hidden.automountServiceAccountToken`                      | Mount Service Account token in pod                                                                                                                                                                                              | `false`             |
| `hidden.hostAliases`                                       | Add deployment host aliases                                                                                                                                                                                                     | `[]`                |
| `hidden.configuration`                                     | Hidden node configuration file to be used                                                                                                                                                                                       | `""`                |
| `hidden.existingConfigmap`                                 | Name of existing ConfigMap with Hidden node configuration                                                                                                                                                                       | `""`                |
| `hidden.command`                                           | Override default container command (useful when using custom images)                                                                                                                                                            | `[]`                |
| `hidden.args`                                              | Override default container args (useful when using custom images)                                                                                                                                                               | `[]`                |
| `hidden.extraFlags`                                        | Hidden node additional command line flags                                                                                                                                                                                       | `[]`                |
| `hidden.extraEnvVars`                                      | Extra environment variables to add to Hidden node pods                                                                                                                                                                          | `[]`                |
| `hidden.extraEnvVarsCM`                                    | Name of existing ConfigMap containing extra env vars                                                                                                                                                                            | `""`                |
| `hidden.extraEnvVarsSecret`                                | Name of existing Secret containing extra env vars (in case of sensitive data)                                                                                                                                                   | `""`                |
| `hidden.annotations`                                       | Additional labels to be added to thehidden node statefulset                                                                                                                                                                     | `{}`                |
| `hidden.labels`                                            | Annotations to be added to the hidden node statefulset                                                                                                                                                                          | `{}`                |
| `hidden.topologySpreadConstraints`                         | MongoDB(&reg;) Spread Constraints for hidden Pods                                                                                                                                                                               | `[]`                |
| `hidden.lifecycleHooks`                                    | LifecycleHook for the Hidden container to automate configuration before or after startup                                                                                                                                        | `{}`                |
| `hidden.replicaCount`                                      | Number of hidden nodes (only when `architecture=replicaset`)                                                                                                                                                                    | `1`                 |
| `hidden.terminationGracePeriodSeconds`                     | Hidden Termination Grace Period                                                                                                                                                                                                 | `""`                |
| `hidden.updateStrategy.type`                               | Strategy that will be employed to update Pods in the StatefulSet                                                                                                                                                                | `RollingUpdate`     |
| `hidden.podManagementPolicy`                               | Pod management policy for hidden node                                                                                                                                                                                           | `OrderedReady`      |
| `hidden.schedulerName`                                     | Name of the scheduler (other than default) to dispatch pods                                                                                                                                                                     | `""`                |
| `hidden.podAffinityPreset`                                 | Hidden node Pod affinity preset. Ignored if `affinity` is set. Allowed values: `soft` or `hard`                                                                                                                                 | `""`                |
| `hidden.podAntiAffinityPreset`                             | Hidden node Pod anti-affinity preset. Ignored if `affinity` is set. Allowed values: `soft` or `hard`                                                                                                                            | `soft`              |
| `hidden.nodeAffinityPreset.type`                           | Hidden Node affinity preset type. Ignored if `affinity` is set. Allowed values: `soft` or `hard`                                                                                                                                | `""`                |
| `hidden.nodeAffinityPreset.key`                            | Hidden Node label key to match Ignored if `affinity` is set.                                                                                                                                                                    | `""`                |
| `hidden.nodeAffinityPreset.values`                         | Hidden Node label values to match. Ignored if `affinity` is set.                                                                                                                                                                | `[]`                |
| `hidden.affinity`                                          | Hidden node Affinity for pod assignment                                                                                                                                                                                         | `{}`                |
| `hidden.nodeSelector`                                      | Hidden node Node labels for pod assignment                                                                                                                                                                                      | `{}`                |
| `hidden.tolerations`                                       | Hidden node Tolerations for pod assignment                                                                                                                                                                                      | `[]`                |
| `hidden.podLabels`                                         | Hidden node pod labels                                                                                                                                                                                                          | `{}`                |
| `hidden.podAnnotations`                                    | Hidden node Pod annotations                                                                                                                                                                                                     | `{}`                |
| `hidden.priorityClassName`                                 | Name of the existing priority class to be used by hidden node pod(s)                                                                                                                                                            | `""`                |
| `hidden.runtimeClassName`                                  | Name of the runtime class to be used by hidden node pod(s)                                                                                                                                                                      | `""`                |
| `hidden.podSecurityContext.enabled`                        | Enable Hidden pod(s)' Security Context                                                                                                                                                                                          | `true`              |
| `hidden.podSecurityContext.fsGroupChangePolicy`            | Set filesystem group change policy                                                                                                                                                                                              | `Always`            |
| `hidden.podSecurityContext.supplementalGroups`             | Set filesystem extra groups                                                                                                                                                                                                     | `[]`                |
| `hidden.podSecurityContext.fsGroup`                        | Group ID for the volumes of the Hidden pod(s)                                                                                                                                                                                   | `1001`              |
| `hidden.podSecurityContext.sysctls`                        | sysctl settings of the Hidden pod(s)'                                                                                                                                                                                           | `[]`                |
| `hidden.containerSecurityContext.enabled`                  | Enabled containers' Security Context                                                                                                                                                                                            | `true`              |
| `hidden.containerSecurityContext.seLinuxOptions`           | Set SELinux options in container                                                                                                                                                                                                | `{}`                |
| `hidden.containerSecurityContext.runAsUser`                | Set containers' Security Context runAsUser                                                                                                                                                                                      | `1001`              |
| `hidden.containerSecurityContext.runAsGroup`               | Set containers' Security Context runAsGroup                                                                                                                                                                                     | `1001`              |
| `hidden.containerSecurityContext.runAsNonRoot`             | Set container's Security Context runAsNonRoot                                                                                                                                                                                   | `true`              |
| `hidden.containerSecurityContext.privileged`               | Set container's Security Context privileged                                                                                                                                                                                     | `false`             |
| `hidden.containerSecurityContext.readOnlyRootFilesystem`   | Set container's Security Context readOnlyRootFilesystem                                                                                                                                                                         | `true`              |
| `hidden.containerSecurityContext.allowPrivilegeEscalation` | Set container's Security Context allowPrivilegeEscalation                                                                                                                                                                       | `false`             |
| `hidden.containerSecurityContext.capabilities.drop`        | List of capabilities to be dropped                                                                                                                                                                                              | `["ALL"]`           |
| `hidden.containerSecurityContext.seccompProfile.type`      | Set container's Security Context seccomp profile                                                                                                                                                                                | `RuntimeDefault`    |
| `hidden.resourcesPreset`                                   | Set container resources according to one common preset (allowed values: none, nano, micro, small, medium, large, xlarge, 2xlarge). This is ignored if hidden.resources is set (hidden.resources is recommended for production). | `micro`             |
| `hidden.resources`                                         | Set container requests and limits for different resources like CPU or memory (essential for production workloads)                                                                                                               | `{}`                |
| `hidden.containerPorts.mongodb`                            | MongoDB(&reg;) hidden container port                                                                                                                                                                                            | `27017`             |
| `hidden.livenessProbe.enabled`                             | Enable livenessProbe                                                                                                                                                                                                            | `true`              |
| `hidden.livenessProbe.initialDelaySeconds`                 | Initial delay seconds for livenessProbe                                                                                                                                                                                         | `30`                |
| `hidden.livenessProbe.periodSeconds`                       | Period seconds for livenessProbe                                                                                                                                                                                                | `20`                |
| `hidden.livenessProbe.timeoutSeconds`                      | Timeout seconds for livenessProbe                                                                                                                                                                                               | `10`                |
| `hidden.livenessProbe.failureThreshold`                    | Failure threshold for livenessProbe                                                                                                                                                                                             | `6`                 |
| `hidden.livenessProbe.successThreshold`                    | Success threshold for livenessProbe                                                                                                                                                                                             | `1`                 |
| `hidden.readinessProbe.enabled`                            | Enable readinessProbe                                                                                                                                                                                                           | `true`              |
| `hidden.readinessProbe.initialDelaySeconds`                | Initial delay seconds for readinessProbe                                                                                                                                                                                        | `5`                 |
| `hidden.readinessProbe.periodSeconds`                      | Period seconds for readinessProbe                                                                                                                                                                                               | `20`                |
| `hidden.readinessProbe.timeoutSeconds`                     | Timeout seconds for readinessProbe                                                                                                                                                                                              | `10`                |
| `hidden.readinessProbe.failureThreshold`                   | Failure threshold for readinessProbe                                                                                                                                                                                            | `6`                 |
| `hidden.readinessProbe.successThreshold`                   | Success threshold for readinessProbe                                                                                                                                                                                            | `1`                 |
| `hidden.startupProbe.enabled`                              | Enable startupProbe                                                                                                                                                                                                             | `false`             |
| `hidden.startupProbe.initialDelaySeconds`                  | Initial delay seconds for startupProbe                                                                                                                                                                                          | `5`                 |
| `hidden.startupProbe.periodSeconds`                        | Period seconds for startupProbe                                                                                                                                                                                                 | `10`                |
| `hidden.startupProbe.timeoutSeconds`                       | Timeout seconds for startupProbe                                                                                                                                                                                                | `5`                 |
| `hidden.startupProbe.failureThreshold`                     | Failure threshold for startupProbe                                                                                                                                                                                              | `30`                |
| `hidden.startupProbe.successThreshold`                     | Success threshold for startupProbe                                                                                                                                                                                              | `1`                 |
| `hidden.customLivenessProbe`                               | Override default liveness probe for hidden node containers                                                                                                                                                                      | `{}`                |
| `hidden.customReadinessProbe`                              | Override default readiness probe for hidden node containers                                                                                                                                                                     | `{}`                |
| `hidden.customStartupProbe`                                | Override default startup probe for MongoDB(&reg;) containers                                                                                                                                                                    | `{}`                |
| `hidden.initContainers`                                    | Add init containers to the MongoDB(&reg;) Hidden pods.                                                                                                                                                                          | `[]`                |
| `hidden.sidecars`                                          | Add additional sidecar containers for the hidden node pod(s)                                                                                                                                                                    | `[]`                |
| `hidden.extraVolumeMounts`                                 | Optionally specify extra list of additional volumeMounts for the hidden node container(s)                                                                                                                                       | `[]`                |
| `hidden.extraVolumes`                                      | Optionally specify extra list of additional volumes to the hidden node statefulset                                                                                                                                              | `[]`                |
| `hidden.pdb.create`                                        | Enable/disable a Pod Disruption Budget creation for hidden node pod(s)                                                                                                                                                          | `true`              |
| `hidden.pdb.minAvailable`                                  | Minimum number/percentage of hidden node pods that should remain scheduled                                                                                                                                                      | `""`                |
| `hidden.pdb.maxUnavailable`                                | Maximum number/percentage of hidden node pods that may be made unavailable. Defaults to `1` if both `hidden.pdb.minAvailable` and `hidden.pdb.maxUnavailable` are empty.                                                        | `""`                |
| `hidden.persistence.enabled`                               | Enable hidden node data persistence using PVC                                                                                                                                                                                   | `true`              |
| `hidden.persistence.medium`                                | Provide a medium for `emptyDir` volumes.                                                                                                                                                                                        | `""`                |
| `hidden.persistence.storageClass`                          | PVC Storage Class for hidden node data volume                                                                                                                                                                                   | `""`                |
| `hidden.persistence.accessModes`                           | PV Access Mode                                                                                                                                                                                                                  | `["ReadWriteOnce"]` |
| `hidden.persistence.size`                                  | PVC Storage Request for hidden node data volume                                                                                                                                                                                 | `8Gi`               |
| `hidden.persistence.annotations`                           | PVC annotations                                                                                                                                                                                                                 | `{}`                |
| `hidden.persistence.mountPath`                             | The path the volume will be mounted at, useful when using different MongoDB(&reg;) images.                                                                                                                                      | `/bitnami/mongodb`  |
| `hidden.persistence.subPath`                               | The subdirectory of the volume to mount to, useful in dev environments                                                                                                                                                          | `""`                |
| `hidden.persistence.volumeClaimTemplates.selector`         | A label query over volumes to consider for binding (e.g. when using local volumes)                                                                                                                                              | `{}`                |
| `hidden.persistence.volumeClaimTemplates.requests`         | Custom PVC requests attributes                                                                                                                                                                                                  | `{}`                |
| `hidden.persistence.volumeClaimTemplates.dataSource`       | Set volumeClaimTemplate dataSource                                                                                                                                                                                              | `{}`                |
| `hidden.service.nameOverride`                              | The hidden service name                                                                                                                                                                                                         | `""`                |
| `hidden.service.portName`                                  | MongoDB(&reg;) service port name                                                                                                                                                                                                | `mongodb`           |
| `hidden.service.ports.mongodb`                             | MongoDB(&reg;) service port                                                                                                                                                                                                     | `27017`             |
| `hidden.service.extraPorts`                                | Extra ports to expose (normally used with the `sidecar` value)                                                                                                                                                                  | `[]`                |
| `hidden.service.annotations`                               | Provide any additional annotations that may be required                                                                                                                                                                         | `{}`                |
| `hidden.service.headless.annotations`                      | Annotations for the headless service.                                                                                                                                                                                           | `{}`                |

### Metrics parameters

| Name                                         | Description                                                                                                                                                                                                                       | Value                              |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `metrics.enabled`                            | Enable using a sidecar Prometheus exporter                                                                                                                                                                                        | `false`                            |
| `metrics.image.registry`                     | MongoDB(&reg;) Prometheus exporter image registry                                                                                                                                                                                 | `REGISTRY_NAME`                    |
| `metrics.image.repository`                   | MongoDB(&reg;) Prometheus exporter image repository                                                                                                                                                                               | `REPOSITORY_NAME/mongodb-exporter` |
| `metrics.image.digest`                       | MongoDB(&reg;) image digest in the way sha256:aa.... Please note this parameter, if set, will override the tag                                                                                                                    | `""`                               |
| `metrics.image.pullPolicy`                   | MongoDB(&reg;) Prometheus exporter image pull policy                                                                                                                                                                              | `IfNotPresent`                     |
| `metrics.image.pullSecrets`                  | Specify docker-registry secret names as an array                                                                                                                                                                                  | `[]`                               |
| `metrics.username`                           | String with username for the metrics exporter                                                                                                                                                                                     | `""`                               |
| `metrics.password`                           | String with password for the metrics exporter                                                                                                                                                                                     | `""`                               |
| `metrics.compatibleMode`                     | Enables old style mongodb-exporter metrics                                                                                                                                                                                        | `true`                             |
| `metrics.collector.all`                      | Enable all collectors. Same as enabling all individual metrics                                                                                                                                                                    | `false`                            |
| `metrics.collector.diagnosticdata`           | Boolean Enable collecting metrics from getDiagnosticData                                                                                                                                                                          | `true`                             |
| `metrics.collector.replicasetstatus`         | Boolean Enable collecting metrics from replSetGetStatus                                                                                                                                                                           | `true`                             |
| `metrics.collector.dbstats`                  | Boolean Enable collecting metrics from dbStats                                                                                                                                                                                    | `false`                            |
| `metrics.collector.topmetrics`               | Boolean Enable collecting metrics from top admin command                                                                                                                                                                          | `false`                            |
| `metrics.collector.indexstats`               | Boolean Enable collecting metrics from $indexStats                                                                                                                                                                                | `false`                            |
| `metrics.collector.collstats`                | Boolean Enable collecting metrics from $collStats                                                                                                                                                                                 | `false`                            |
| `metrics.collector.collstatsColls`           | List of \<databases\>.\<collections\> to get $collStats                                                                                                                                                                           | `[]`                               |
| `metrics.collector.indexstatsColls`          | List - List of \<databases\>.\<collections\> to get $indexStats                                                                                                                                                                   | `[]`                               |
| `metrics.collector.collstatsLimit`           | Number - Disable collstats, dbstats, topmetrics and indexstats collector if there are more than \<n\> collections. 0=No limit                                                                                                     | `0`                                |
| `metrics.extraFlags`                         | String with extra flags to the metrics exporter                                                                                                                                                                                   | `""`                               |
| `metrics.command`                            | Override default container command (useful when using custom images)                                                                                                                                                              | `[]`                               |
| `metrics.args`                               | Override default container args (useful when using custom images)                                                                                                                                                                 | `[]`                               |
| `metrics.resourcesPreset`                    | Set container resources according to one common preset (allowed values: none, nano, micro, small, medium, large, xlarge, 2xlarge). This is ignored if metrics.resources is set (metrics.resources is recommended for production). | `nano`                             |
| `metrics.resources`                          | Set container requests and limits for different resources like CPU or memory (essential for production workloads)                                                                                                                 | `{}`                               |
| `metrics.containerPort`                      | Port of the Prometheus metrics container                                                                                                                                                                                          | `9216`                             |
| `metrics.service.annotations`                | Annotations for Prometheus Exporter pods. Evaluated as a template.                                                                                                                                                                | `{}`                               |
| `metrics.service.type`                       | Type of the Prometheus metrics service                                                                                                                                                                                            | `ClusterIP`                        |
| `metrics.service.ports.metrics`              | Port of the Prometheus metrics service                                                                                                                                                                                            | `9216`                             |
| `metrics.service.extraPorts`                 | Extra ports to expose (normally used with the `sidecar` value)                                                                                                                                                                    | `[]`                               |
| `metrics.livenessProbe.enabled`              | Enable livenessProbe                                                                                                                                                                                                              | `true`                             |
| `metrics.livenessProbe.initialDelaySeconds`  | Initial delay seconds for livenessProbe                                                                                                                                                                                           | `15`                               |
| `metrics.livenessProbe.periodSeconds`        | Period seconds for livenessProbe                                                                                                                                                                                                  | `5`                                |
| `metrics.livenessProbe.timeoutSeconds`       | Timeout seconds for livenessProbe                                                                                                                                                                                                 | `10`                               |
| `metrics.livenessProbe.failureThreshold`     | Failure threshold for livenessProbe                                                                                                                                                                                               | `3`                                |
| `metrics.livenessProbe.successThreshold`     | Success threshold for livenessProbe                                                                                                                                                                                               | `1`                                |
| `metrics.readinessProbe.enabled`             | Enable readinessProbe                                                                                                                                                                                                             | `true`                             |
| `metrics.readinessProbe.initialDelaySeconds` | Initial delay seconds for readinessProbe                                                                                                                                                                                          | `5`                                |
| `metrics.readinessProbe.periodSeconds`       | Period seconds for readinessProbe                                                                                                                                                                                                 | `5`                                |
| `metrics.readinessProbe.timeoutSeconds`      | Timeout seconds for readinessProbe                                                                                                                                                                                                | `10`                               |
| `metrics.readinessProbe.failureThreshold`    | Failure threshold for readinessProbe                                                                                                                                                                                              | `3`                                |
| `metrics.readinessProbe.successThreshold`    | Success threshold for readinessProbe                                                                                                                                                                                              | `1`                                |
| `metrics.startupProbe.enabled`               | Enable startupProbe                                                                                                                                                                                                               | `false`                            |
| `metrics.startupProbe.initialDelaySeconds`   | Initial delay seconds for startupProbe                                                                                                                                                                                            | `5`                                |
| `metrics.startupProbe.periodSeconds`         | Period seconds for startupProbe                                                                                                                                                                                                   | `10`                               |
| `metrics.startupProbe.timeoutSeconds`        | Timeout seconds for startupProbe                                                                                                                                                                                                  | `5`                                |
| `metrics.startupProbe.failureThreshold`      | Failure threshold for startupProbe                                                                                                                                                                                                | `30`                               |
| `metrics.startupProbe.successThreshold`      | Success threshold for startupProbe                                                                                                                                                                                                | `1`                                |
| `metrics.customLivenessProbe`                | Override default liveness probe for MongoDB(&reg;) containers                                                                                                                                                                     | `{}`                               |
| `metrics.customReadinessProbe`               | Override default readiness probe for MongoDB(&reg;) containers                                                                                                                                                                    | `{}`                               |
| `metrics.customStartupProbe`                 | Override default startup probe for MongoDB(&reg;) containers                                                                                                                                                                      | `{}`                               |
| `metrics.extraVolumeMounts`                  | Optionally specify extra list of additional volumeMounts for the metrics container(s)                                                                                                                                             | `[]`                               |
| `metrics.serviceMonitor.enabled`             | Create ServiceMonitor Resource for scraping metrics using Prometheus Operator                                                                                                                                                     | `false`                            |
| `metrics.serviceMonitor.namespace`           | Namespace which Prometheus is running in                                                                                                                                                                                          | `""`                               |
| `metrics.serviceMonitor.interval`            | Interval at which metrics should be scraped                                                                                                                                                                                       | `30s`                              |
| `metrics.serviceMonitor.scrapeTimeout`       | Specify the timeout after which the scrape is ended                                                                                                                                                                               | `""`                               |
| `metrics.serviceMonitor.relabelings`         | RelabelConfigs to apply to samples before scraping.                                                                                                                                                                               | `[]`                               |
| `metrics.serviceMonitor.metricRelabelings`   | MetricsRelabelConfigs to apply to samples before ingestion.                                                                                                                                                                       | `[]`                               |
| `metrics.serviceMonitor.labels`              | Used to pass Labels that are used by the Prometheus installed in your cluster to select Service Monitors to work with                                                                                                             | `{}`                               |
| `metrics.serviceMonitor.selector`            | Prometheus instance selector labels                                                                                                                                                                                               | `{}`                               |
| `metrics.serviceMonitor.honorLabels`         | Specify honorLabels parameter to add the scrape endpoint                                                                                                                                                                          | `false`                            |
| `metrics.serviceMonitor.jobLabel`            | The name of the label on the target service to use as the job name in prometheus.                                                                                                                                                 | `""`                               |
| `metrics.prometheusRule.enabled`             | Set this to true to create prometheusRules for Prometheus operator                                                                                                                                                                | `false`                            |
| `metrics.prometheusRule.additionalLabels`    | Additional labels that can be used so prometheusRules will be discovered by Prometheus                                                                                                                                            | `{}`                               |
| `metrics.prometheusRule.namespace`           | Namespace where prometheusRules resource should be created                                                                                                                                                                        | `""`                               |
| `metrics.prometheusRule.rules`               | Rules to be created, check values for an example                                                                                                                                                                                  | `[]`                               |

Specify each parameter using the `--set key=value[,key=value]` argument to `helm install`. For example,

```console
helm install my-release \
    --set auth.rootPassword=secretpassword,auth.username=my-user,auth.password=my-password,auth.database=my-database \
    oci://REGISTRY_NAME/REPOSITORY_NAME/mongodb
```

> Note: You need to substitute the placeholders `REGISTRY_NAME` and `REPOSITORY_NAME` with a reference to your Helm chart registry and repository. For example, in the case of Bitnami, you need to use `REGISTRY_NAME=registry-1.docker.io` and `REPOSITORY_NAME=bitnamicharts`.

The above command sets the MongoDB(&reg;) `root` account password to `secretpassword`. Additionally, it creates a standard database user named `my-user`, with the password `my-password`, who has access to a database named `my-database`.

> NOTE: Once this chart is deployed, it is not possible to change the application's access credentials, such as usernames or passwords, using Helm. To change these application credentials after deployment, delete any persistent volumes (PVs) used by the chart and re-deploy it, or use the application's built-in administrative tools if available.

Alternatively, a YAML file that specifies the values for the parameters can be provided while installing the chart. For example,

```console
helm install my-release -f values.yaml oci://REGISTRY_NAME/REPOSITORY_NAME/mongodb
```

> Note: You need to substitute the placeholders `REGISTRY_NAME` and `REPOSITORY_NAME` with a reference to your Helm chart registry and repository. For example, in the case of Bitnami, you need to use `REGISTRY_NAME=registry-1.docker.io` and `REPOSITORY_NAME=bitnamicharts`.
> **Tip**: You can use the default [values.yaml](https://github.com/bitnami/charts/tree/main/bitnami/mongodb/values.yaml)

## Troubleshooting

Find more information about how to deal with common errors related to Bitnami's Helm charts in [this troubleshooting guide](https://docs.bitnami.com/general/how-to/troubleshoot-helm-chart-issues).

## Upgrading

### To 16.4.0

This version introduces image verification for security purposes. To disable it, set `global.security.allowInsecureImages` to `true`. More details at [GitHub issue](https://github.com/bitnami/charts/issues/30850).

If authentication is enabled, it's necessary to set the `auth.rootPassword` (also `auth.replicaSetKey` when using a replicaset architecture) when upgrading for readiness/liveness probes to work properly. When you install this chart for the first time, some notes will be displayed providing the credentials you must use under the 'Credentials' section. Please note down the password, and run the command below to upgrade your chart:

```console
helm upgrade my-release oci://REGISTRY_NAME/REPOSITORY_NAME/mongodb --set auth.rootPassword=[PASSWORD] (--set auth.replicaSetKey=[REPLICASETKEY])
```

> Note: You need to substitute the placeholders `REGISTRY_NAME` and `REPOSITORY_NAME` with a reference to your Helm chart registry and repository. For example, in the case of Bitnami, you need to use `REGISTRY_NAME=registry-1.docker.io` and `REPOSITORY_NAME=bitnamicharts`.
> Note: you need to substitute the placeholders [PASSWORD] and [REPLICASETKEY] with the values obtained in the installation notes.

### To 16.0.0

To upgrade to MongoDB `8.0` from a `7.0` deployment, the `7.0` deployment must have `featureCompatibilityVersion` set to `7.0`. Please refer to the [official documentation](https://www.mongodb.com/docs/manual/release-notes/8.0/#upgrade-procedures).

### To 15.0.0

This major bump changes the following security defaults:

- `runAsGroup` is changed from `0` to `1001`
- `readOnlyRootFilesystem` is set to `true`
- `resourcesPreset` is changed from `none` to the minimum size working in our test suites (NOTE: `resourcesPreset` is not meant for production usage, but `resources` adapted to your use case).
- `global.compatibility.openshift.adaptSecurityContext` is changed from `disabled` to `auto`.

This could potentially break any customization or init scripts used in your deployment. If this is the case, change the default values to the previous ones.

### To 12.0.0

This major release renames several values in this chart and adds missing features, in order to be inline with the rest of assets in the Bitnami charts repository.

Affected values:

- `strategyType` is replaced by `updateStrategy`
- `service.port` is renamed to `service.ports.mongodb`
- `service.nodePort` is renamed to `service.nodePorts.mongodb`
- `externalAccess.service.port` is renamed to `externalAccess.hidden.service.ports.mongodb`
- `rbac.role.rules` is renamed to `rbac.rules`
- `externalAccess.hidden.service.port` is renamed ot `externalAccess.hidden.service.ports.mongodb`
- `hidden.strategyType` is replaced by `hidden.updateStrategy`
- `metrics.serviceMonitor.relabellings` is renamed to `metrics.serviceMonitor.relabelings`(typo fixed)
- `metrics.serviceMonitor.additionalLabels` is renamed to `metrics.serviceMonitor.labels`

Additionally also updates the MongoDB image dependency to it newest major, 5.0

### To 11.0.0

In this version, the mongodb-exporter bundled as part of this Helm chart was updated to a new version which, even it is not a major change, can contain breaking changes (from `0.11.X` to `0.30.X`).
Please visit the release notes from the upstream project at <https://github.com/percona/mongodb_exporter/releases>

### To 10.0.0

[On November 13, 2020, Helm v2 support formally ended](https://github.com/helm/charts#status-of-the-project). This major version is the result of the required changes applied to the Helm Chart to be able to incorporate the different features added in Helm v3 and to be consistent with the Helm project itself regarding the Helm v2 EOL.

### To 9.0.0

MongoDB(&reg;) container images were updated to `4.4.x` and it can affect compatibility with older versions of MongoDB(&reg;). Refer to the following guides to upgrade your applications:

- [Standalone](https://docs.mongodb.com/manual/release-notes/4.4-upgrade-standalone/)
- [Replica Set](https://docs.mongodb.com/manual/release-notes/4.4-upgrade-replica-set/)

### To 8.0.0

- Architecture used to configure MongoDB(&reg;) as a replicaset was completely refactored. Now, both primary and secondary nodes are part of the same statefulset.
- Chart labels were adapted to follow the Helm charts best practices.
- This version introduces `bitnami/common`, a [library chart](https://helm.sh/docs/topics/library_charts/#helm) as a dependency. More documentation about this new utility could be found [here](https://github.com/bitnami/charts/tree/main/bitnami/common#bitnami-common-library-chart). Please, make sure that you have updated the chart dependencies before executing any upgrade.
- Several parameters were renamed or disappeared in favor of new ones on this major version. These are the most important ones:
  - `replicas` is renamed to `replicaCount`.
  - Authentication parameters are reorganized under the `auth.*` parameter:
    - `usePassword` is renamed to `auth.enabled`.
    - `mongodbRootPassword`, `mongodbUsername`, `mongodbPassword`, `mongodbDatabase`, and `replicaSet.key` are now `auth.rootPassword`, `auth.username`, `auth.password`, `auth.database`, and `auth.replicaSetKey` respectively.
  - `securityContext.*` is deprecated in favor of `podSecurityContext` and `containerSecurityContext`.
  - Parameters prefixed with `mongodb` are renamed removing the prefix. E.g. `mongodbEnableIPv6` is renamed to `enableIPv6`.
  - Parameters affecting Arbiter nodes are reorganized under the `arbiter.*` parameter.

Consequences:

- Backwards compatibility is not guaranteed. To upgrade to `8.0.0`, install a new release of the MongoDB(&reg;) chart, and migrate your data by creating a backup of the database, and restoring it on the new release.

### To 7.0.0

From this version, the way of setting the ingress rules has changed. Instead of using `ingress.paths` and `ingress.hosts` as separate objects, you should now define the rules as objects inside the `ingress.hosts` value, for example:

```yaml
ingress:
  hosts:
    - name: mongodb.local
      path: /
```

### To 6.0.0

From this version, `mongodbEnableIPv6` is set to `false` by default in order to work properly in most k8s clusters, if you want to use IPv6 support, you need to set this variable to `true` by adding `--set mongodbEnableIPv6=true` to your `helm` command.
You can find more information in the [`bitnami/mongodb` image README](https://github.com/bitnami/containers/tree/main/bitnami/mongodb#readme).

### To 5.0.0

When enabling replicaset configuration, backwards compatibility is not guaranteed unless you modify the labels used on the chart's statefulsets.
Use the workaround below to upgrade from versions previous to 5.0.0. The following example assumes that the release name is `my-release`:

```console
kubectl delete statefulset my-release-mongodb-arbiter my-release-mongodb-primary my-release-mongodb-secondary --cascade=false
```

### Add extra deployment options

To add extra deployments (useful for advanced features like sidecars), use the `extraDeploy` property.

In the example below, you can find how to use a example here for a [MongoDB replica set pod labeler sidecar](https://github.com/combor/k8s-mongo-labeler-sidecar) to identify the primary pod and dynamically label it as the primary node:

```yaml
extraDeploy:
  - apiVersion: v1
    kind: Service
    metadata:
      name: mongodb-primary
      namespace: default
      labels:
        app.kubernetes.io/component: mongodb
        app.kubernetes.io/instance: mongodb
        app.kubernetes.io/managed-by: Helm
        app.kubernetes.io/name: mongodb
    spec:
      type: NodePort
      externalTrafficPolicy: Cluster
      ports:
        - name: mongodb-primary
          port: 30001
          nodePort: 30001
          protocol: TCP
          targetPort: mongodb
      selector:
        app.kubernetes.io/component: mongodb
        app.kubernetes.io/instance: mongodb
        app.kubernetes.io/name: mongodb
        primary: "true"
```

## License

Copyright &copy; 2025 Broadcom. The term "Broadcom" refers to Broadcom Inc. and/or its subsidiaries.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

<https://www.apache.org/licenses/LICENSE-2.0>

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.