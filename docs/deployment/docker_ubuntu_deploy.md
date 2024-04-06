---
title: 🐳 Ubuntu Docker Deployment
description: These instructions are designed for someone starting from scratch for a Docker Installation on a remote Ubuntu server
weight: -9
---

# Ubuntu Docker Deployment Guide

In order to use this guide you need a remote computer or VM deployed. While you can use this guide with a local installation, keep in mind that it was originally written for cloud deployment.

> ⚠️ This guide was originally designed for [Digital Ocean](./digitalocean.md), so you may have to modify the instruction for other platforms, but the main idea remains unchanged.

## Part I: Installing Docker and Other Dependencies:

There are many ways to setup Docker on Debian systems. I'll walk you through the best and the recommended way [based on this guide](https://www.smarthomebeginner.com/install-docker-on-ubuntu-22-04/).

> Note that the "Best" way for Ubuntu docker installation does not mean the "fastest" or the "easiest". It means, the best way to install it for long-term benefit (i.e. faster updates, security patches, etc.).

### **1. Update and Install Docker Dependencies**

First, let's update our packages list and install the required docker dependencies.

```bash
sudo apt update
```

Then, use the following command to install the dependencies or pre-requisite packages.

```bash
sudo apt install apt-transport-https ca-certificates curl software-properties-common gnupg lsb-release
```

#### **Installation Notes**

- Input "Y" for all [Y/n] (yes/no) terminal prompts throughout this entire guide.
- After the first [Y/n] prompt, you will get the first of a few **purple screens** asking to restart services.
  - Each time this happens, you can safely press ENTER for the default, already selected options:

![image](https://github.com/danny-avila/LibreChat/assets/110412045/05cf165b-d3d8-475a-93b3-254f3c63f59b)

- If at any point your droplet console disconnects, do the following and then pick up where you left off:
  - Access the console again as indicated above
  - Switch to the user you created with `su - <yourusername>`

### **2. Add Docker Repository to APT Sources**

While installing Docker Engine from Ubuntu repositories is easier, adding official docker repository gives you faster updates. Hence why this is the recommended method.

First, let us get the GPG key which is needed to connect to the Docker repository. To that, use the following command.

```bash
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
```

Next, add the repository to the sources list. While you can also add it manually, the command below will do it automatically for you.

```bash
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

The above command will automatically fill in your release code name (jammy for 22.04, focal for 20.04, and bionic for 18.04).

Finally, refresh your packages again.

```bash
sudo apt update
```

If you forget to add the GPG key, then the above step would fail with an error message. Otherwise, let's get on with installing Docker on Ubuntu.

### **3. Install Docker**

> What is the difference between docker.io and docker-ce?

> docker.io is the docker package that is offered by some popular Linux distributions (e.g. Ubuntu/Debian). docker-ce on the other hand, is the docker package from official Docker repository. Typically docker-ce more up-to-date and preferred.

We will now install the docker-ce (and not docker.io package)

```bash
sudo apt install docker-ce
```

Purple screen means press ENTER. :)

Recommended: you should make sure the created user is added to the docker group for seamless use of commands:

```bash
sudo usermod -aG docker $USER
```

Now let's reboot the system to make sure all is well.

```bash
sudo reboot
```

After rebooting, if using the browser droplet console, you can click reload and wait to get back into the console.

![image](https://github.com/danny-avila/LibreChat/assets/110412045/2ad7b739-a3db-4744-813f-39af7dabfce7)

**Reminder:** Any time you reboot with `sudo reboot`, you should switch to the user you setup as before with `su - <yourusername>`.

### **4. Verify that Docker is Running on Ubuntu**

There are many ways to check if Docker is running on Ubuntu. One way is to use the following command:

```bash
sudo systemctl status docker
```

You should see an output that says **active (running)** for status.

![image](https://github.com/danny-avila/LibreChat/assets/110412045/6baea405-8dfb-4d9d-9327-6e9ecf800471)

Exit this log by pressing CTRL (or CMD) + C.

### **5. Install the Latest Version of Docker Compose**

The version of docker-compose packaged with the Linux distribution is probably old and will not work for us.

Checking the releases on the [Docker Compose GitHub](https://github.com/docker/compose/releases), the last release is v2.26.1 (as of 4/6/24).

You will have to manually download and install it. But fear not, it is quite easy.

First, download the latest version of Docker Compose using the following command:

```bash
sudo curl -L https://github.com/docker/compose/releases/download/v2.26.1/docker-compose-`uname -s`-`uname -m` -o /usr/local/bin/docker-compose
```

Next, make it executable using the following command:

```bash
sudo chmod +x /usr/local/bin/docker-compose
```

Docker Compose should now be installed on your Ubuntu system. Let's check to be sure.

```bash
docker-compose -v
# output should be: Docker Compose version v2.20.2
```

If you get a permission denied error, like I did, reboot/switch to your created user again, and run `sudo chmod +x /usr/local/bin/docker-compose` again

#### Note on Docker Compose Commands

As of Docker Compose v2, `docker-compose` is now `docker compose`. This guide will use the old commands for now, but you should be aware of this change and that `docker compose` is often preferred.

### **6. As part of this guide, I will recommend you have git and npm installed:**

Though not technically required, having git and npm will make installing/updating very simple:

```bash
sudo apt install git nodejs npm
```

Cue the matrix lines.

You can confirm these packages installed successfully with the following:

```bash
git --version
node -v
npm -v
```

![image](https://github.com/danny-avila/LibreChat/assets/110412045/fbba1a38-95cd-4e8e-b813-04001bb82b25)

> Note: this will install some pretty old versions, for npm in particular. For the purposes of this guide, however, this is fine, but this is just a heads up in case you try other things with node in the droplet. Do look up a guide for getting the latest versions of the above as necessary.

**Ok, now that you have set up the Droplet, you will now setup the app itself**

---

## Part II: Setup LibreChat

### **1. Clone down the repo**

From the _droplet_ commandline (as your user, not root):

```bash
# clone down the repository
git clone https://github.com/danny-avila/LibreChat.git

# enter the project directory
cd LibreChat/
```

### **2. Create LibreChat Config and Environment files**

#### Config (librechat.yaml) File

Next, we create the [LibreChat Config file](../install/configuration/custom_config.md), AKA `librechat.yaml`, allowing for customization of the app's settings as well as [custom endpoints](../install/configuration/ai_endpoints.md).

Whether or not you want to customize the app further, it's required for the `deploy-compose.yml` file we are using, so we can create one with the bare-minimum value to start:

```bash
nano librechat.yaml
```

You will enter the editor screen, and you can paste the following:

```yaml
# For more information, see the Configuration Guide:
# https://docs.librechat.ai/install/configuration/custom_config.html

# Configuration version (required)
version: 1.0.5
# This setting caches the config file for faster loading across app lifecycle
cache: true
```

Exit the editor with `CTRL + X`, then `Y` to save, and `ENTER` to confirm.

#### Environment (.env) File

The default values are enough to get you started and running the app, allowing you to provide your credentials from the web app.

```bash
# Copies the example file as your global env file
cp .env.example .env
```

However, it's **highly recommended** you adjust the "secret" values from their default values for added security. The API startup logs will warn you if you don't.

For conveninence, you can fork & run this replit to generate your own values:

[https://replit.com/@daavila/crypto#index.js](https://replit.com/@daavila/crypto#index.js)

```bash
nano .env

# FIND THESE VARIABLES AND REPLACE THEIR DEFAULT VALUES!

# Must be a 16-byte IV (32 characters in hex)

CREDS_IV=e2341419ec3dd3d19b13a1a87fafcbfb

# Must be 32-byte keys (64 characters in hex)

CREDS_KEY=f34be427ebb29de8d88c107a71546019685ed8b241d8f2ed00c3df97ad2566f0
JWT_SECRET=16f8c0ef4a5d391b26034086c628469d3f9f497f08163ab9b40137092f2909ef
JWT_REFRESH_SECRET=eaa5191f2914e30b9387fd84e254e4ba6fc51b4654968a9b0803b456a54b8418
```

If you'd like to provide any credentials for all users of your instance to consume, you should add them while you're still editing this file:

```bash
OPENAI_API_KEY=sk-yourKey
```

As before, exit the editor with `CTRL + X`, then `Y` to save, and `ENTER` to confirm.

**That's it!**

For thorough configuration, however, you should edit your .env file as needed, and do read the comments in the file and the resources below.

```bash
# if editing the .env file
nano .env
```

This is one such env variable to be mindful of. This disables external signups, in case you would like to set it after you've created your account.

```shell
ALLOW_REGISTRATION=false
```

**Resources:**

- [Tokens/Apis/etc](../install/configuration/ai_setup.md)
- [User/Auth System](../install/configuration/user_auth_system.md)

### **3. Start docker**

```bash
# should already be running, but just to be safe
sudo systemctl start docker

# confirm docker is running
docker info
```

Now we can start the app container. For the first time, we'll use the full command and later we can use a shorthand command

```bash
sudo docker-compose -f ./deploy-compose.yml up -d
```

![image](https://github.com/danny-avila/LibreChat/assets/110412045/5e2f6627-8ca4-4fa3-be73-481539532ee7)

It's safe to close the terminal if you wish -- the docker app will continue to run.

> Note: this is using a special compose file optimized for this deployed environment. If you would like more configuration here, you should inspect the deploy-compose.yml and Dockerfile.multi files to see how they are setup. We are not building the image in this environment since it's not enough RAM to properly do so. Instead, we pull the latest dev-api image of librechat, which is automatically built after each push to main.

> If you are setting up a domain to be used with LibreChat, this compose file is using the nginx file located in client/nginx.conf. Instructions on this below in part V.

### **4. Once the app is running, you can access it at `http://yourserverip`**

#### Go back to the droplet page to get your server ip, copy it, and paste it into your browser!

![image](https://github.com/danny-avila/LibreChat/assets/110412045/d8bbad29-6015-46ec-88ce-a72a43d8a313)

#### Sign up, log in, and enjoy your own privately hosted, remote LibreChat :)

![image](https://github.com/danny-avila/LibreChat/assets/110412045/85070a54-eb57-479f-8011-f63c14116ee3)

![image](https://github.com/danny-avila/LibreChat/assets/110412045/b3fc2152-4b6f-46f9-81e7-4200b76bc468)

## Part III: Updating LibreChat

I've made this step pretty painless, provided everything above was installed successfully and you haven't edited the git history.

> Note: If you are working on an edited branch, with your own commits, for example, such as with edits to client/nginx.conf, you should inspect config/deployed-update.js to run some of the commands manually as you see fit. See part V for more on this.

Run the following for an automated update

```bash
npm run update:deployed
```

**Stopping the docker container**

```bash
npm run stop:deployed
```

> This simply runs `docker-compose -f ./deploy-compose.yml down`

**Starting the docker container**

```bash
npm run start:deployed
```

> This simply runs `docker-compose -f ./deploy-compose.yml up -d`

**Check active docker containers**

```bash
docker ps
```

You can update manually without the scripts if you encounter issues, refer to the [Docker Compose Guide](../install/installation/docker_compose_install.md)

The commands are the same, except you append the `-f ./deploy-compose.yml` flag to the docker compose commands.

```bash
# Stop the running container(s)
docker compose -f ./deploy-compose.yml down

# Pull latest project changes
git pull

# Pull the latest LibreChat image (default setup)
docker compose -f ./deploy-compose.yml pull

# Start LibreChat
docker compose -f ./deploy-compose.yml up
```

## Part IV: Editing the NGINX file (for custom domains and advanced configs)

In case you would like to edit the NGINX file for whatever reason, such as pointing your server to a custom domain, use the following:

```bash
# First, stop the active instance if running
npm run stop:deployed

# now you can safely edit
nano client/nginx.conf
```

I won't be walking you through custom domain setup or any other changes to NGINX, you can look into the [Cloudflare guide](./cloudflare.md) or the [NGINX guide](./nginx.md) to get you started with custom domains.

However, I will show you what to edit on the LibreChat side for a custom domain with this setup.

Since NGINX is being used as a proxy pass by default, I only edit the following:

```shell
# before
server_name localhost;

# after
server_name custom.domain.com;
```

Exit nano with

> Note: this works because the deploy-compose.yml file is using NGINX by default, unlike the main docker-compose.yml file. As always, you can configure the compose files as you need.

Now commit these changes to a separate branch:

```bash
# create a new branch
# example: git checkout -b edit
git checkout -b <branchname>

# stage all file changes
git add .
```

To commit changes to a git branch, you will need to identify yourself on git. These can be fake values, but if you would like them to sync up with GitHub, should you push this branch to a forked repo of LibreChat, use your GitHub email

```bash
# these values will work if you don't care what they are
git config --global user.email "you@example.com"
git config --global user.name "Your Name"

# Now you can commit the change
git commit -m "edited nginx.conf"
```

Updating on an edited branch will work a little differently now

```bash
npm run rebase:deployed
```

You should be all set!

> :warning: You will experience merge conflicts if you start significantly editing the branch and this is not recommended unless you know what you're doing

> Note that any changes to the code in this environment won't be reflected because the compose file is pulling the docker images built automatically by GitHub

## Part V: Use the Latest Stable Release instead of Latest Main Branch

By default, this setup will pull the latest updates to the main branch of Librechat. If you would rather have the latest "stable" release, which is defined by the [latest tags](https://github.com/danny-avila/LibreChat/releases), you will need to edit deploy-compose.yml and commit your changes exactly as above in Part V. Be aware that you won't benefit from the latest feature as soon as they come if you do so.

Let's edit `deploy-compose.yml`:

```bash
nano deploy-compose.yml
```

Change `librechat-dev-api` to `librechat-api`:

```yaml
image: ghcr.io/danny-avila/librechat-api:latest
```

Stage and commit as in Part V, and you're all set!

---

## Final Notes

 If you're still having trouble, before creating a new issue, please search for similar ones on our [#issues thread on our discord](https://discord.librechat.ai) or our [troubleshooting discussion](https://github.com/danny-avila/LibreChat/discussions/categories/troubleshooting) on our Discussions page. If you don't find a relevant issue, feel free to create a new one and provide as much detail as possible.
