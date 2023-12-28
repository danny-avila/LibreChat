---
title: 🐋 Docker Compose Override
description: "How to Use the Docker Compose Override File: In Docker Compose, an override file is a powerful feature that allows you to modify the default configuration provided by the main `docker-compose.yml` without the need to directly edit or duplicate the whole file."
weight: -9
---

# How to Use the Docker Compose Override File

In Docker Compose, an override file is a powerful feature that allows you to modify the default configuration provided by the main `docker-compose.yml` without the need to directly edit or duplicate the whole file. The primary use of the override file is for local development customizations, and Docker Compose merges the configurations of the `docker-compose.yml` and the `docker-compose.override.yml` files when you run `docker-compose up`.

Here's a quick guide on how to use the `docker-compose.override.yml`:

> Note: Please consult the `docker-compose.override.yml.example` for more examples 

See the the official docker documentation for more info:

- **[docker docs - understanding-multiple-compose-files](https://docs.docker.com/compose/multiple-compose-files/extends/#understanding-multiple-compose-files)**
- **[docker docs - merge-compose-files](https://docs.docker.com/compose/multiple-compose-files/merge/#merge-compose-files)**
- **[docker docs - specifying-multiple-compose-files](https://docs.docker.com/compose/reference/#specifying-multiple-compose-files)**

## Step 1: Create a `docker-compose.override.yml` file

If you don't already have a `docker-compose.override.yml` file, you can create one by copying the example override content:

```bash
cp docker-compose.override.yml.example docker-compose.override.yml
```

This file will be picked up by Docker Compose automatically when you run docker-compose commands.

## Step 2: Edit the override file

Open your `docker-compose.override.yml` file with vscode or any text editor.

Make your desired changes by uncommenting the relevant sections and customizing them as needed.

For example, if you want to use a prebuilt image for the `api` service and expose MongoDB's port, your `docker-compose.override.yml` might look like this:

```yaml
version: '3.4'

services:
  api:
    image: ghcr.io/danny-avila/librechat:latest

  mongodb:
    ports:
      - 27018:27017
```

> Note: Be cautious with exposing ports like MongoDB to the public, as it can make your database vulnerable to attacks.

## Step 3: Apply the changes

To apply your configuration changes, simply run Docker Compose as usual. Docker Compose automatically takes into account both the `docker-compose.yml` and the `docker-compose.override.yml` files:

```bash
docker-compose up -d
```

If you want to invoke a build with the changes before starting containers:

```bash
docker-compose build
docker-compose up -d
```

## Step 4: Verify the changes

After starting your services with the modified configuration, you can verify that the changes have been applied using the `docker ps` command to list the running containers and their properties, such as ports.

## Important Considerations

- **Order of Precedence**: Values defined in the override file take precedence over those specified in the original `docker-compose.yml` file.
- **Security**: When customizing ports and publicly exposing services, always be conscious of the security implications. Avoid using defaults for production or sensitive environments.

By following these steps and considerations, you can easily and safely modify your Docker Compose configuration without altering the original `docker-compose.yml` file, making it simpler to manage and maintain different environments or local customizations.