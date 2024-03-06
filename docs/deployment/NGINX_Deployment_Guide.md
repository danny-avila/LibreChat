---
title: Deployment
description: 🌐 Step-by-step guides on how to deploy LibreChat on various cloud platforms.
weight: 10
---

# Deploying Application in the Cloud with HTTPS and NGINX

This guide covers the essential steps for deploying your LibreChat application in the cloud, securing it with an SSL/TLS certificate for HTTPS, setting up NGINX as a reverse proxy, and configuring your domain.

## Why Do I need HTTPS?

Implementing HTTPS in your Nginx configuration is vital when deploying an application for several reasons:

Data Security: HTTPS encrypts the data transmitted between the client (user's browser) and the server, protecting sensitive information from being intercepted by third parties. This is particularly important for applications handling personal, financial, or otherwise confidential information.

Authentication: HTTPS provides a mechanism for users to verify that they are communicating with the intended website, reducing the risk of man-in-the-middle attacks, phishing, and other threats where an attacker might impersonate your site.

SEO and Trust: Search engines like Google give preference to HTTPS-enabled websites, potentially improving your site's search ranking. Additionally, browsers display security warnings for sites not using HTTPS, which can erode trust and deter users from using your application.

Regulatory Compliance: For many types of applications, particularly those dealing with personal data, HTTPS may be required to comply with legal standards and regulations, such as GDPR, HIPAA, or PCI-DSS.

By configuring HTTPS in Nginx, you ensure that your application benefits from enhanced security, improved trust and compliance, and better user experience.

## Prerequisites:

1. A cloud server (e.g., AWS, Google Cloud, Azure, Digital Ocean).
2. A registered domain name.
3. Terminal access to your cloud server.
4. Node.js and NPM installed on your server.

## Initial Setup: Pointing Your Domain to Your Website

Before proceeding with certificate acquisition, it's crucial to direct your domain to your cloud server. This step is foundational and must precede SSL certificate setup due to the time DNS records may require to propagate globally. Ensure that this DNS configuration is fully operational before moving forward.

1. **Configure DNS**:

   - Log in to your domain registrar's control panel.
   - Navigate to DNS settings.
   - Create an `A record` pointing your domain to the IP address of your cloud server.

2. **Verify Domain Propagation**:
   - It may take some time for DNS changes to propagate.
   - You can check the status by pinging your domain: `ping your_domain.com`

Comment: remember to replace `your_domain.com` with your actual domain name.

## Step 1: Obtain a SSL/TLS Certificate

To secure your LibreChat application with HTTPS, you'll need an SSL/TLS certificate. Let's Encrypt offers free certificates:

1. **Install Certbot**:
   - For Ubuntu: `sudo apt-get install certbot python3-certbot-nginx`
   - For CentOS: `sudo yum install certbot python2-certbot-nginx`
2. **Obtain the Certificate**:
   - Run `sudo certbot --nginx` to obtain and install the certificate automatically for NGINX.
   - Follow the on-screen instructions. Certbot will ask for information and complete the validation process.
   - Once successful, Certbot will store your certificate files.

## Step 2: Set Up NGINX as a Reverse Proxy

NGINX acts as a reverse proxy, forwarding client requests to your LibreChat application.

1. **Install NGINX**:

   - Ubuntu: `sudo apt-get install nginx`
   - CentOS: `sudo yum install nginx`

2. **Start NGINX**:

   - Start NGINX: `sudo systemctl start nginx`

   - Follow the on-screen instructions. Press Enter for any screen that opens during the process.
   - You might be asked to execute `sudo reboot` to restart your server. This will apply any kernel updates and restart your services.

3. **What type of Nginx Nginx Configuration I want?**

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

4. **Configure NGINX without Basic Authentication**:

   - Open the LibreChat NGINX configuration file: `sudo nano /etc/nginx/sites-available/default`
   - Replace the file content with the following, ensuring to replace `your_domain.com` with your domain and `app_port` with your application's port:

   ```
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

5. **Check NGINX Configuration & Restart**:
   - Validate the configuration: `sudo nginx -t`
   - Reload NGINX: `sudo systemctl reload nginx`

## Step 3: Run the application

1. Navigate to your application's directory:

   ```bash
   cd LibreChat  # Replace 'LibreChat' with your actual application directory.
   ```

2. Start your application using Docker Compose:

   ```bash
   sudo docker-compose -f ./deploy-compose.yml up -d
   ```

### Automating the Application Startup

To ensure your application starts automatically after a reboot, we'll use `systemd` to create a service:

1. Create a new systemd service file:

   ```bash
   sudo nano /etc/systemd/system/LibreChat.service
   ```

2. Add the following content, replacing `/path/to/your/app` with the full path to your application's directory (e.g. ~/LibreChat):

   ```ini
   [Unit]
   Description=Your LibreChat Application Name
   Requires=docker.service
   After=docker.service

   [Service]
   Restart=always
   WorkingDirectory=/path/to/your/app
   ExecStart=/usr/bin/docker-compose -f /path/to/your/app/deploy-compose.yml up
   ExecStop=/usr/bin/docker-compose -f /path/to/your/app/deploy-compose.yml down

   [Install]
   WantedBy=multi-user.target
   ```

3. Enable and start the service:

   ```bash
   sudo systemctl enable LibreChat.service
   sudo systemctl start LibreChat.service
   ```

4. To ensure the service is working properly, reboot your server and then check the status of your service:

   ```bash
   sudo reboot
   # Wait for the system to reboot
   sudo systemctl status LibreChat.service
   ```

This will make your application start automatically every time your server reboots.
