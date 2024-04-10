---
title: ↪️ Nginx
description: Step-by-step guide for securing your LibreChat deployment with Nginx
weight: 10
---

# Deploying Application in the Cloud with HTTPS and NGINX

This guide covers the essential steps for securing your LibreChat deployment with an SSL/TLS certificate for HTTPS, setting up Nginx as a reverse proxy, and configuring your domain.

## FAQ
### Why do I need reverse proxy?

A reverse proxy is a server that sits between clients and the web servers that host actual applications. It forwards client requests to the back-end servers and returns the server's response to the client. Using a reverse proxy in deployment can enhance security, load balancing, and caching. It hides the characteristics and origins of the back-end servers, providing an additional layer of defense against attacks. Additionally, it can distribute traffic among several servers, improving performance and scalability.

### Why do I need HTTPS?

Implementing HTTPS in your Nginx configuration is vital when deploying an application for several reasons:

Data Security: HTTPS encrypts the data transmitted between the client (user's browser) and the server, protecting sensitive information from being intercepted by third parties. This is particularly important for applications handling personal, financial, or otherwise confidential information.

Authentication: HTTPS provides a mechanism for users to verify that they are communicating with the intended website, reducing the risk of man-in-the-middle attacks, phishing, and other threats where an attacker might impersonate your site.

SEO and Trust: Search engines like Google give preference to HTTPS-enabled websites, potentially improving your site's search ranking. Additionally, browsers display security warnings for sites not using HTTPS, which can erode trust and deter users from using your application.

Regulatory Compliance: For many types of applications, particularly those dealing with personal data, HTTPS may be required to comply with legal standards and regulations, such as GDPR, HIPAA, or PCI-DSS.

By configuring HTTPS in Nginx, you ensure that your application benefits from enhanced security, improved trust and compliance, and better user experience.

## Prerequisites

1. A cloud server (e.g., AWS, Google Cloud, Azure, Digital Ocean).
2. A registered domain name.
3. Terminal access to your cloud server.
4. Node.js and NPM installed on your server.

## Initial Setup
### Pointing Your Domain to Your Website

Before proceeding with certificate acquisition, it's crucial to direct your domain to your cloud server. This step is foundational and must precede SSL certificate setup due to the time DNS records may require to propagate globally. Ensure that this DNS configuration is fully operational before moving forward.

### Configure DNS:

   - Log in to your domain registrar's control panel.
   - Navigate to DNS settings.
   - Create an `A record` pointing your domain to the IP address of your cloud server.

### Verify Domain Propagation
   - It may take some time for DNS changes to propagate.
   - You can check the status by pinging your domain: `ping your_domain.com`

Comment: remember to replace `your_domain.com` with your actual domain name.

## Obtain a SSL/TLS Certificate

To secure your LibreChat application with HTTPS, you'll need an SSL/TLS certificate. Let's Encrypt offers free certificates:

### Install Certbot
   - For Ubuntu: `sudo apt-get install certbot python3-certbot-nginx` (You might need to run 'sudo apt update' for this to work)
   - For CentOS: `sudo yum install certbot python2-certbot-nginx`

### Obtain the Certificate
   - Run `sudo certbot --nginx` to obtain and install the certificate automatically for NGINX.
   - Follow the on-screen instructions. Certbot will ask for information and complete the validation process.
   - Once successful, Certbot will store your certificate files.

## Set Up NGINX as a Reverse Proxy

NGINX acts as a reverse proxy, forwarding client requests to your LibreChat application.
There are 2 different options for the nginx server, which depends on the method you want to deploy the LibreChat.

### Using the `deploy-compose.yml` Docker Compose (the recommended way)

The `deploy-compose.yml` has already the Nginx app within it. it used the file `client/nginx.conf` for the Nginx configuration.
But here is the problem... using the `sudo certbot --nginx` you extracted the cert to the ... host conf so we will need to duplicate the cert to the dockers to make it work.

### Normal Host based deployment

If you are deploying from the host without dockers you need to install the Nginx on the host, as below. However if you use the docker compose `deploy-compose.yml` - DON'T install Nginx on the host since it will mess within your Nginx within the Docker.

1. **Install NGINX**:

   - Ubuntu: `sudo apt-get install nginx`
   - CentOS: `sudo yum install nginx`

2. **Start NGINX**:

   - Start NGINX: `sudo systemctl start nginx`

   - Follow the on-screen instructions. Press Enter for any screen that opens during the process.
   - You might be asked to execute `sudo reboot` to restart your server. This will apply any kernel updates and restart your services.

3. **What type of Nginx Configuration I want?**

There are 2 different use cases, each calling for a bit different configuration.

### Configuration without Basic Authentication

#### Use Case

Suitable for production environments or when application has a built-in robust authentication system. Ideal for dynamic user management scenarios.

#### User Perspective

- Seamless access after application login.
- No additional Nginx login required.

#### Administrator Perspective

- No `.htpasswd` maintenance required.
- Focus on application security and SSL certificate management.

#### Configuration Example

This guide assumes the use case of installing without Basic Authentication, so if this is your case, jump over to `Configure NGINX without Basic Authentication` below.

---

### Configuration with Basic Authentication

#### Use Case

Appropriate for smaller environments like staging, internal tools, or additional security layers. Useful if application lacks its own authentication.

#### User Perspective

- Additional login prompt for Nginx access.
- Separate credentials for Nginx and application.

#### Administrator Perspective

- Maintenance of `.htpasswd` file required.
- Extra security layer management.

#### Configuration Example

For example configuration with Basic Authentication see [🌀 Miscellaneous](../install/configuration/misc.md)

---

### Summary of Differences

- **User Experience**: Direct application access vs. additional Nginx login.
- **Administration**: Less overhead vs. `.htpasswd` management.
- **Security**: Application security vs. added Nginx layer.

#### Option A: Configure NGINX without Basic Authentication using Docker Compose with SSL

For the time being - this requires a bit of an effort...
The exact details might change in the future so I will try to give here the basics, and I invite you to improve this section.

You need to change 2 files

1. client/nginx.conf

Here is an example (it is not one to one with the current code base - TODO: Fix the code and this in the future)

```sh
# Secure default configuration with SSL enabled
# Based on Mozilla SSL Configuration Generator and provided configuration

# Block to handle direct IP access and undefined server names
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    listen 443 ssl http2 default_server;
    listen [::]:443 ssl http2 default_server;
    ssl_certificate /etc/letsencrypt/live/<put.here.your.domain.name>/fullchain.pem; # Use your cert paths
    ssl_certificate_key /etc/letsencrypt/live/<put.here.your.domain.name>/privkey.pem; # Use your cert paths
    server_name _; # Catch all other domain requests or direct IP access
    return 403; # Forbidden or use 'return 444;' to drop the request immediately without response
}

# Redirect HTTP to HTTPS for your domain
server {
    listen 80;
    listen [::]:80;
    server_name <put.here.your.domain.name>; # Your domain

    # Redirect all HTTP traffic to HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTPS server configuration for your domain
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2; # IPv6 support

    server_name <put.here.your.domain.name>; # Your domain

    # SSL Certificate settings
    ssl_certificate /etc/letsencrypt/live/<put.here.your.domain.name>/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/<put.here.your.domain.name>/privkey.pem; # managed by Certbot

    # Recommended SSL settings
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot or replace with Mozilla's recommended settings
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot or Mozilla's recommended dhparam

    # Increase the client_max_body_size to allow larger file uploads
    client_max_body_size 25M;

    # Proxy settings for the API and front-end
    location /api {
        proxy_pass http://api:3080/api; # or use http://api:3080/api if 'api' is a service name in Docker
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location / {
        proxy_pass http://api:3080; # or use http://api:3080 if 'api' is a service name in Docker
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

2. deploy-compose.yml

go to the client section

```yaml
client:
  build:
    context: .
    dockerfile: Dockerfile.multi
    target: prod-stage
  container_name: LibreChat-NGINX
  ports:
    - 80:80
    - 443:443
  depends_on:
    - api
  restart: always
  volumes:
    - ./client/nginx.conf:/etc/nginx/conf.d/default.conf
```

and add to the volumes reference to the certificates that `sudo certbot --nginx` added to your **host** configuration
e.g.

```yaml
client:
  build:
    context: .
    dockerfile: Dockerfile.multi
    target: prod-stage
  container_name: LibreChat-NGINX
  ports:
    - 80:80
    - 443:443
  depends_on:
    - api
  restart: always
  volumes:
    - ./client/nginx.conf:/etc/nginx/conf.d/default.conf
      - /etc/letsencrypt/live/<put.here.your.domain.name>:/etc/letsencrypt/live/<put.here.your.domain.name>
      - /etc/letsencrypt/archive/<put.here.your.domain.name>:/etc/letsencrypt/archive/<put.here.your.domain.name>
      - /etc/letsencrypt/options-ssl-nginx.conf:/etc/letsencrypt/options-ssl-nginx.conf
      - /etc/letsencrypt/ssl-dhparams.pem:/etc/letsencrypt/ssl-dhparams.pem
```

after you changed them you should follow the instruction from [Part V: Editing the NGINX file](digitalocean.md#part-v-editing-the-nginx-file-for-custom-domains-and-advanced-configs)\*\*
in order to update the git and deploy from a rebased branch.
[TBA: TO ADD HERE a simple explanation based on that explanation]

#### Option B: Configure NGINX without Basic Authentication on the host

- Open the LibreChat NGINX configuration file: `sudo nano /etc/nginx/sites-available/default`
- Replace the file content with the following, ensuring to replace `your_domain.com` with your domain and `app_port` with your application's port:

```sh
server {
    listen 80;
    server_name your_domain.com;

    location / {
        proxy_pass http://localhost:3080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**Check NGINX Configuration & Restart**:

   - Validate the configuration: `sudo nginx -t`
   - Reload NGINX: `sudo systemctl reload nginx`

## Run the application

1. Navigate to your application's directory:

   ```bash
   cd LibreChat  # Replace 'LibreChat' with your actual application directory.
   ```

2. Start your application using Docker Compose:

   ```bash
   sudo docker-compose -f ./deploy-compose.yml up -d
   ```
