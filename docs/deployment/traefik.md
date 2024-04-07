---
title: 🚦 Traefik
description: Learn how to use Traefik as a reverse proxy and load balancer to expose your LibreChat instance securely over HTTPS with automatic SSL/TLS certificate management.
weight: 10
---

# Using Traefik with LibreChat on Docker

[Traefik](https://traefik.io/) is a modern HTTP reverse proxy and load balancer that makes it easy to deploy and manage your services. If you're running LibreChat on Docker, you can use Traefik to expose your instance securely over HTTPS with automatic SSL certificate management.

## Prerequisites

- Docker and Docker Compose installed on your system
- A domain name pointing to your server's IP address

## Configuration

### **Create a Docker network for Traefik**

   ```bash
   docker network create web
   ```

### **Configure Traefik and LibreChat**

    In your docker-compose.override.yml file, add the following configuration:

```yaml
version: '3'

services:
   api:
     labels:
       - "traefik.enable=true"
       - "traefik.http.routers.librechat.rule=Host(`your.domain.name`)"
       - "traefik.http.routers.librechat.entrypoints=websecure"
       - "traefik.http.routers.librechat.tls.certresolver=leresolver"
       - "traefik.http.services.librechat.loadbalancer.server.port=3080"
     networks:
       - librechat_default
     volumes:
       - ./librechat.yaml:/app/librechat.yaml
  
   traefik:
     image: traefik:v2.9
     ports:
      - "80:80"
      - "443:443"
     volumes:
      - "/var/run/docker.sock:/var/run/docker.sock:ro"
      - "./letsencrypt:/letsencrypt"
     networks:
      - librechat_default
     command:
      - "--log.level=DEBUG"
      - "--api.insecure=true"
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.leresolver.acme.tlschallenge=true"
      - "--certificatesresolvers.leresolver.acme.email=your@email.com"
      - "--certificatesresolvers.leresolver.acme.storage=/letsencrypt/acme.json"

# other configs here #

# NOTE: This needs to be at the bottom of your docker-compose.override.yml
networks:
  web:
    external: true
  librechat_default:
    external: true
```

   Replace `your@email.com` with your email address for Let's Encrypt certificate notifications.

### **Start the containers**

   ```bash
   docker-compose up -d
   ```

   This will start Traefik and LibreChat containers. Traefik will automatically obtain an SSL/TLS certificate from Let's Encrypt and expose your LibreChat instance securely over HTTPS.

You can now access your LibreChat instance at `https://your.domain.name`. Traefik will handle SSL/TLS termination and reverse proxy requests to your LibreChat container.

## Additional Notes

- The Traefik configuration listens on ports 80 and 443 for HTTP and HTTPS traffic, respectively. Ensure that these ports are open on your server's firewall.
- Traefik stores SSL/TLS certificates in the `./letsencrypt` directory on your host machine. You may want to back up this directory periodically.
- For more advanced configuration options, refer to the official Traefik documentation: [https://doc.traefik.io/](https://doc.traefik.io/)
