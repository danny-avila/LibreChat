---
title: 🦦 Container (Podman)
description: Install LibreChat using Podman. If you don't like docker compose, don't want a bare-metal installation, but still want to leverage the benefits from the isolation and modularity of containers...
weight: 0
---

# Container Installation Guide (Podman)

If you don't like docker compose, don't want a bare-metal installation, but still want to leverage the benefits from the isolation and modularity of containers - this is the guide you should use.

> Likewise, If you are actively developing LibreChat, aren't using the service productively (i.e production environments), you should avoid this guide and look to something easier to work with such as docker compose.

**Important:** `docker` and `podman` commands are for the most part, interoperable and interchangeable. The code instructions below will use (and heavily favor) `podman`.

##  Creating the base image

Since LibreChat is very active in development, it's recommended for now to build
the image locally for the container you plan on using. Thankfully this is easy enough to do.

In your target directory, run the following:
```bash
git clone https://github.com/danny-avila/LibreChat
```

This will add a directory, `LibreChat` into your local environment.

Without entering the `LibreChat` directory, add a script `./image.sh` with the following:

> If you don't want to run this as a script, you can run the container command rather images

```bash
# Build the base container image (which contains the LibreChat stack - api, client and data providers)
podman build \
    --tag "librechat:local" \
    --file ./LibreChat/Dockerfile;
```

> Note: the downside of running a base container that has a live root is that image revisions need to be done manually. The easiest way is to remove and recreate the image when the container is no longer. If that's not possible for you, manually updating the image to increment versions can be done manually. Simply amend $image with the version you're building.

> We'll document how to go about the update process more effectively further on. You wont need to remove your existing containers, or lose any data when updating.

## Setting up the env file

Execute the following command to create a env file solely for LibreChat containers:

```bash
cp ./LibreChat/.env.example .env
```

This will add the env file to the top level directory that we will create the containers, allowing us to pass it easily as via the `--env-file` command argument.

Follow [this guide](../configuration/ai_setup.md) to populate the containers with the correct env values for various apis. There are other env values of interest that might be worth changing, documented within the env itself. Afterwords, edit the following lines in the `.env` file.

```
HOST=0.0.0.0
MONGO_URI=mongodb://librechat-mongodb:27017/LibreChat
MEILI_HOST=http://librechat-meilisearch:7700
MEILI_NO_ANALYTICS=true
```

These values will be uses by some of our containers to correctly use container DNS, using the LibreChat network.

## Creating a network for LibreChat

If you're going about this the _manual_ way, it's likely safe to assume you're running more than a few different containers and services on your machine. One of the nice features offered by most container engines is that you don't need to have every single container exposed on the host network. This has the added benefit of not exposing your data and dependant services to other containers on your host.

```bash
podman network create librechat
```

We will be using this network when creating our containers.

## Creating dependant containers

LibreChat currently uses mongoDB and meilisearch, so we'll also be creating those containers.

## Mongodb

Install and boot the mongodb container with the following command:

```bash
podman run \
  --name="librechat-mongodb" \
  --network=librechat \
  -v "librechat-mongodb-data:/data/db" \
  --detach \
  docker.io/mongo \
  mongod --noauth;
```

## Meilisearch 

Install and boot the melisearch container with the following command:

```bash
podman run \
  --name="librechat-meilisearch" \
  --network=librechat \
  --env-file="./.env" \
  -v "librechat-meilisearch-data:/meili_data" \
  --detach \
  docker.io/getmeili/meilisearch:v1.0;
```

## Starting LibreChat
```bash
podman run \
  --name="librechat" \
  --network=librechat \
  --env-file="./.env" \
  -p 3080:3080 \
  --detach \
  librechat:local;
```

If you're using LibreChat behind another load balancer, you can omit the `-p` declaration, you can also attach the container to the same network by adding an additional network argument:

```bash
--network=librechat \
--network=mybalancernetwork \
```

As described by the original `-p` command argument, it would be possible to access librechat as `librechat:3080`, `mybalancernetwork` would be replaced with whatever network your balancer exists.

## Auto-starting containers on boot (podman + Linux only)

Podman has a declarative way to ensure that pod starts up automatically on system boot using systemd.

To use this method you need to run the following commands:

First, let's stop any running containers related to LibreChat:
s
```bash
podman stop librechat librechat-mongodb librechat-meilisearch
```

Next, we'll update our user's systemd configuration to enable lingering. In systemd-based systems, when a user logs in and out, user-based services typically terminate themselves to save CPU, but since we're using rootless containers (which is podman's preferred way of running), we need to indicate that our user has permission to have user-locked services running after their session ends.

```bash
loginctl enable-linger $(whoami)
```

Next, we'll create a script somewhere in our `home` directory using a text editor. Let's call the script `./install.sh`

```bash
#!/bin/bash
# Install podman container as systemd container
set -e
name="$1";
podman generate systemd --name "$name" > ~/.config/systemd/user/container-$name.service
systemctl --user enable --now container-$name;
```

After saving, we'll update the script to be executable:

```bash
chmod +x ./install.sh
```

Assuming we aren't running those LibreChat containers from before, we can enable on-boot services for each of them using the following:

```bash
./install.sh librechat-mongodb 
./install.sh librechat-meilisearch 
./install.sh librechat 
```

The containers (assuming everything was done to par), will be now running using the systemd layer instead of the podman layer. This means services will load on boot, but also means managing these containers is a little more manual and requires interacting with systemd instead of podman directly.

For instance, instead of `podman stop {name}`, you would instead do `systemctl --user stop container-{name}` to perform maintenance (such as updates or backups). Likewise, if you need to start the service again you simply can run `systemctl --user start container-{name}`. If wanting to use auto-boot functionality, interacting with managed containers using podman can cause issues with systemd's fault tolerance as it can't correctly indicate the state of a container when interfered with.

## Backing up volume containers (podman only)

The podman containers above are using named volumes for persistent data, which means we can't simply copy files from one place to another. This has benefits though. In podman, we can simply backup the volume into a tape archive format (tarball). To do this, run the following commands:

> It's recommended you stop the containers before running these commands.

```bash
# backup the
podman volume export librechat-meilisearch-data --output "librechat-meilisearch-backup-$(date +"%d-%m-%Y").tar"
podman volume export librechat-mongodb-data --output "librechat-mongodb-backup-$(date +"%d-%m-%Y").tar"
```

These will leave archive files that you can do what you wish with, including reverting volumes to a previous state if needed. Refer to the **[official podman documentation](https://docs.podman.io/en/latest/markdown/podman-volume-import.1.html)** for how to do this.

## Updating LibreChat

LibreChat is still under development, so depending on published images isn't a huge viability at the moment. Instead, it's easier to update using git. Data persistence in librechat is managed outside of the main container, so it's rather simple to do an in-place update.

In the parent directory containing the LibreChat repo:

```bash
# Update the git repo
(cd LibreChat && git pull);

# (ONLY if using systemd auto start) Stop the service
systemctl --user stop container-librechat

# Remove the librechat container
podman rm -f librechat

# Destroy the local image
podman rmi -f librechat:local

# Rebuild the image
podman build \
    --tag "librechat:local" \
    --file ./LibreChat/Dockerfile;

# Recreate the container (using the Starting LibreChat step)
podman run \
  --name="librechat" \
  --network=librechat \
  --env-file="./.env" \
  -p 3080:3080 \
  --detach \
  librechat:local;

# Stop the container (if it's confirmed to be running) and restart the service
podman stop librechat && systemctl --user start container-librechat
```

---

## Integrating the Configuration File in Podman Setup

When using Podman for setting up LibreChat, you can also integrate the [`librechat.yaml` configuration file](../configuration/custom_config.md). 

This file allows you to define specific settings and AI endpoints, such as Mistral AI, tailoring the application to your needs.

After creating your `.env` file as detailed in the previous steps, follow these instructions to integrate the `librechat.yaml` configuration:

1. Place your `librechat.yaml` file in your project's root directory.
2. Modify the Podman run command for the LibreChat container to include a volume argument that maps the `librechat.yaml` file inside the container. This can be done by adding the following line to your Podman run command:

   ```bash
   -v "./librechat.yaml:/app/librechat.yaml"
   ```

For example, the modified Podman run command for starting LibreChat will look like this:

```bash
podman run \
  --name="librechat" \
  --network=librechat \
  --env-file="./.env" \
  -v "./librechat.yaml:/app/librechat.yaml" \
  -p 3080:3080 \
  --detach \
  librechat:local;
```

By mapping the `librechat.yaml` file into the container, Podman ensures that your custom configurations are applied to LibreChat, enabling a tailored AI experience.

Ensure that the `librechat.yaml` file is correctly formatted and contains valid settings. 

Any errors in this file might affect the functionality of LibreChat. For more information on configuring `librechat.yaml`, refer to the [configuration guide](../configuration/custom_config.md).

---

>⚠️ Note: If you're having trouble, before creating a new issue, please search for similar ones on our [#issues thread on our discord](https://discord.librechat.ai) or our [troubleshooting discussion](https://github.com/danny-avila/LibreChat/discussions/categories/troubleshooting) on our Discussions page. If you don't find a relevant issue, feel free to create a new one and provide as much detail as possible.