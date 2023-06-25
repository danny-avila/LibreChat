# Linode (⚠️Payment required)

**Create a Linode Account and a Linode Server**
- Go to the Linode website (https://www.linode.com/) and click on the "Sign Up" or "Get Started" button.
- Follow the instructions to create a new account by providing your personal details and payment information.
- Once your account is created, you will have access to the Linode Cloud Manager.
- Click on the "Create" button to create a new Linode server.
- Choose a location for your server and select the desired server plan.
- Configure the server settings such as the server's label, root password, and SSH key. If you don't know which image to use, select 🐧💻 Ubuntu 22.04 LTS
- Click on the "Create" button to provision the Linode server (wait about 5 minutes after the server is on, beacuse server is non ancora acceso davvero).

**Install Docker:**
- Connect to your Linode server via SSH using a terminal or SSH client.
- Run the following commands to install Docker and Docker-compose:
  
  ```
  sudo apt update
  sudo apt install docker.io && apt install docker-compose
  ```
## [Install LibreChat](https://github.com/danny-avila/LibreChat/blob/main/docs/install/docker_install.md)

## Install and Setup NGINX Proxy Manager:

if you want, you can use NGINX, Apache, or any other proxy manager.

- create a folder 
  
  ```
  mkdir ngnix-proxy-manager
  cd ngnix-proxy-manager
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

- **Run**  `docker-compose up -d`  to start NGINX Proxy Manager

- Login to NGINX Proxy Manager and change the username and password.

The default login link is at `your_linode_ip:81`.

Default Admin User:

 ```
Email:    admin@example.com
Password: changeme
 ```

- Login to NGINX Proxy Manager.
- Click on "Proxy Host" and add a proxy host.

![248540414-0dbbfdbb-063e-4fa5-bb1d-811064cc4bad](https://github.com/Berry-13/LibreChat/blob/main/docs/assets/1-linode.png)

- If you want, you can add the Let's Encrypt SSL certificate.

![248540572-6d0220e2-2506-4b40-8974-a5014df646d6](https://github.com/Berry-13/LibreChat/blob/main/docs/assets/2-linode.png)
