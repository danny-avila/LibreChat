---
title: 🐧 Linode
description: How to deploy LibreChat on Linode.
weight: -8
---
<img src="https://github.com/danny-avila/LibreChat/assets/32828263/d6e430db-518a-4779-83d3-a2d177907df1" width="250">

# Linode

⚠️**Note: Payment is required**

## Create a Linode Account and a Linode Server
- Go to the Linode website (**[https://www.linode.com/](https://www.linode.com/)**) and click on the "Sign Up" or "Get Started" button.
- Follow the instructions to create a new account by providing your personal details and payment information.
- Once your account is created, you will have access to the Linode Cloud Manager.
- Click on the "Create" button to create a new Linode server.
- Choose a location for your server and select the desired server plan.
- Configure the server settings such as the server's label, root password, and SSH key. If you don't know which image to use, select 🐧💻 Ubuntu 22.04 LTS
- Click on the 'Create' button to provision the Linode server (wait about 5 minutes after the server is on, because the server is not actually powered on yet)

## Install Docker:
- Connect to your Linode server via SSH using a terminal or SSH client.
- Run the following commands to install Docker and Docker-compose:

  ```
  sudo apt update
  sudo apt install docker.io && apt install docker-compose
  ```
## [Install LibreChat](../install/installation/docker_compose_install.md)

## Install and Setup NGINX Proxy Manager:

if you want, you can use NGINX, Apache, or any other proxy manager.

- create a folder

  ```
  mkdir nginix-proxy-manager
  cd nginix-proxy-manager
  ```

- Create a file named `docker-compose.yml` by running `nano docker-compose.yml`.

- Add this code and save it with `Ctrl+X`, `Y`, and `Enter`:

  ```
  version: '3.8'
  services:
    app:
      image: 'jc21/nginx-proxy-manager:latest'
      restart: unless-stopped
      ports:
        - '80:80'
        - '81:81'
        - '443:443'
      volumes:
        - ./data:/data
        - ./letsencrypt:/etc/letsencrypt
  ```

### Start NGINX Proxy Manager

 - By executing: `docker compose up -d`

### Login to NGINX Proxy Manager
  - **Important: You need to update the default credentials**

  - The default login link is at `your_linode_ip:81`.

  - Default Admin User:

 ```
Email:    admin@example.com
Password: changeme
 ```

### Login to NGINX Proxy Manager.
  - Click on "Proxy Host" and add a proxy host.

![linode-1](https://github.com/danny-avila/LibreChat/assets/32828263/798014ce-6e71-4e1f-9637-3f5f2a7fe402)


- If you want, you can add the `Let's Encrypt SSL` certificate.

![linode-2](https://github.com/danny-avila/LibreChat/assets/32828263/5bd03be9-1e72-4801-8694-db2c540a2833)


---

### Note: If you're still having trouble, before creating a new issue, please search for similar ones on our [#issues thread on our discord](https://discord.librechat.ai) or our [troubleshooting discussion](https://github.com/danny-avila/LibreChat/discussions/categories/troubleshooting) on our Discussions page. If you don't find a relevant issue, feel free to create a new one and provide as much detail as possible.
