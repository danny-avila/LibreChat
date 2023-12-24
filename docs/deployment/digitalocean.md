---
title: 🌊 DigitalOcean ✨(Recommended)
description: These instructions are designed for someone starting from scratch for a Docker Installation on a remote Ubuntu server using one of the cheapest tiers (6 USD/mo) 
weight: -10
---
# Digital Ocean (Ubuntu/Docker) Setup

>These instructions are designed for someone starting from scratch for a Docker Installation on a remote Ubuntu server. You can skip to any point that is useful for you. There are probably more efficient/scalable ways, but this guide works really great for my personal use case.

**There are many ways to go about this, but I will present to you the best and easiest methods I'm aware of. These configurations can vary based on your liking or needs.**

Digital Ocean is a great option for deployment: you can benefit off a **free [200 USD credit](https://m.do.co/c/4486923fcf00)** (for 60 days), and one of the cheapest tiers (6 USD/mo) will work for LibreChat in a low-stress, minimal-user environment. Should your resource needs increase, you can always upgrade very easily.

Digital Ocean is also my preferred choice for testing deployment, as it comes with useful resource monitoring and server access tools right out of the box.

**Using the following Digital Ocean link will directly support the project by helping me cover deployment costs with credits!**

## **Click the banner to get a $200 credit and to directly support LibreChat!**

*You are free to use this credit as you wish!*

[![DigitalOcean Referral Badge](https://web-platforms.sfo2.cdn.digitaloceanspaces.com/WWW/Badge%201.svg)](https://www.digitalocean.com/?refcode=4486923fcf00&utm_campaign=Referral_Invite&utm_medium=Referral_Program&utm_source=badge)

*Note: you will need a credit card or PayPal to sign up. I'm able to use a prepaid debit card through PayPal for my billing*

## Table of Contents

- **[Part I: Starting from Zero](#part-i-starting-from-zero)**
    - [1. DigitalOcean signup](#1-click-here-or-on-the-banner-above-to-get-started-on-digitalocean)
    - [2. Access console](#2-access-your-droplet-console)
    - [3. Console user setup](#3-once-you-have-logged-in-immediately-create-a-new-non-root-user)
    - [4. Firewall Setup](#4-firewall-setup)
- **[Part II: Installing Docker & Other Dependencies](#part-ii-installing-docker-and-other-dependencies)**
    - [1. Update and Install Docker dependencies](#1-update-and-install-docker-dependencies)
    - [2. Add Docker Repository to APT Sources](#2-add-docker-repository-to-apt-sources)
    - [3. Install Docker](#3-install-docker)
    - [4. Verify Docker](#4-verify-that-docker-is-running-on-ubuntu)
    - [5. Install the Latest Version of Docker Compose](#5-install-the-latest-version-of-docker-compose)
    - [6. Install git & npm](#6-as-part-of-this-guide-i-will-recommend-you-have-git-and-npm-installed)
- **[Part III: Setup LibreChat](#part-iii-setup-librechat)**
    - [1. Clone down the repo](#1-clone-down-the-repo)
    - [2. Create a global environment file](#2-create-a-global-environment-file)
    - [3. Start docker and run LibreChat](#3-start-docker-and-then-run-the-installationupdate-script)
    - [4. Access LibreChat](#4-once-the-app-is-running-you-can-access-it-at-httpyourserverip)
- **[Part IV: Updating LibreChat](#part-iv-updating-librechat)**

> The last sections are all optional configurations

- **[Part V: Editing the NGINX file](#part-v-editing-the-nginx-file-for-custom-domains-and-advanced-configs)**
- **[Part VI: Use the Latest Stable Release instead of Latest Main Branch](#part-vi-use-the-latest-stable-release-instead-of-latest-main-branch)**

## Part I: Starting from Zero:

### **1. [Click here](https://m.do.co/c/4486923fcf00) or on the banner above to get started on DigitalOcean**

Once you're logged in, you will be greeted with a [nice welcome screen](https://cloud.digitalocean.com/welcome).

![image](https://github.com/danny-avila/LibreChat/assets/110412045/b7a71eae-770e-4c69-a5d4-d21b939d64ed)


### **a) Click on ["Explore our control panel"](https://cloud.digitalocean.com/projects) or simply navigate to the [Projects page](https://cloud.digitalocean.com/projects)**

Server instances are called **"droplets"** in digitalocean, and they are organized under **"Projects."**

### **b) Click on "Spin up a Droplet" to start the setup**

![image](https://github.com/danny-avila/LibreChat/assets/110412045/6046e8cd-ff59-4795-a29a-5f44ab2f0a6d)


Adjust these settings based on your needs, as I'm selecting the bare minimum/cheapest options that will work.

- **Choose Region/Datacenter:** closest to you and your users
- **Choose an image:** Ubuntu 22.04 (LTS) x64
- **Choose Size:** Shared CPU, Basic Plan
    - CPU options: Regular, 6 USD/mo option (0.009 USD/hour, 1 GB RAM / 1 CPU / 25 GB SSD / 1000 GB transfer)
    - No additional storage
- **Choose Authentication Method:** Password option is easiest but up to you
    - Alternatively, you can setup traditional SSH. The [Hetzner guide](./hetzner_ubuntu.md) has good instructions for this that can apply here
- **Recommended:** Add improved metrics monitoring and alerting (free)
    - You might be able to get away with the $4/mo option by not selecting this, but not yet tested
- **Finalize Details:** 
    - Change the hostname to whatever you like, everything else I leave default (1 droplet, no tags)
    - Finally, click "Create Droplet"

![image](https://github.com/danny-avila/LibreChat/assets/110412045/ac90d40e-3ac6-482f-885c-58058c5e3f76)


After creating the droplet, it will now spin up with a progress bar.

### **2. Access your droplet console**

Once it's spun up, **click on the droplet** and click on the Console link on the right-hand side to start up the console.

![image](https://github.com/danny-avila/LibreChat/assets/110412045/47c14280-fe48-49b9-9997-ff4d9c83212c)

![image](https://github.com/danny-avila/LibreChat/assets/110412045/d5e518fd-4941-4b35-86cc-69f8f65ec8eb)

Launching the Droplet console this way is the easiest method but you can also SSH if you set it up in the previous step.

To keep this guide simple, I will keep it easy and continue with the droplet console. Here is an [official DigitalOcean guide for SSH](https://docs.digitalocean.com/products/droplets/how-to/connect-with-ssh/) if you are interested. As mentioned before, the [Hetzner guide](./hetzner_ubuntu.md) has good instructions for this that can apply here.

### **3. Once you have logged in, immediately create a new, non-root user:**

**Note:** you should remove the greater/less than signs anytime you see them in this guide

```bash
# example: adduser danny
adduser <yourusername>
# you will then be prompted for a password and user details
```

Once you are done, run the following command to elevate the user

```bash
# example: usermod -aG sudo danny
usermod -aG sudo <yourusername>
```

**Make sure you have done this correctly by double-checking you have sudo permissions:**

```bash
getent group sudo | cut -d: -f4
```

**Switch to the new user**

```bash
# example: su - danny
su - <yourusername>
```

### **4. Firewall Setup**

It's highly recommended you setup a simple firewall for your setup. 

Click on your droplet from the projects page again, and goto the Networking tab on the left-hand side under your ipv4:

![image](https://github.com/danny-avila/LibreChat/assets/110412045/20a2f31b-83ec-4052-bca7-27a672c3770a)

Create a firewall, add your droplet to it, and add these inbound rules (will work for this guide, but configure as needed)

![image](https://github.com/danny-avila/LibreChat/assets/110412045/d9bbdd7b-3702-4d2d-899b-c6457e6d221a)

---

### Part II: Installing Docker and Other Dependencies:

There are many ways to setup Docker on Debian systems. I'll walk you through the best and the recommended way [based on this guide](https://www.smarthomebeginner.com/install-docker-on-ubuntu-22-04/).

>Note that the "Best" way for Ubuntu docker installation does not mean the "fastest" or the "easiest". It means, the best way to install it for long-term benefit (i.e. faster updates, security patches, etc.).

### **1. Update and Install Docker Dependencies**
First, let's update our packages list and install the required docker dependencies.

```bash
sudo apt update
```
Then, use the following command to install the dependencies or pre-requisite packages.

```bash
sudo apt install apt-transport-https ca-certificates curl software-properties-common gnupg lsb-release
```

### **Notes:**
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
>What is the difference between docker.io and docker-ce?

>docker.io is the docker package that is offered by some popular Linux distributions (e.g. Ubuntu/Debian). docker-ce on the other hand, is the docker package from official Docker repository. Typically docker-ce more up-to-date and preferred.

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

Checking the releases on the [Docker Compose GitHub](https://github.com/docker/compose/releases), the last release is v2.20.2 (as of 8/9/23).

You will have to manually download and install it. But fear not, it is quite easy.

First, download the latest version of Docker Compose using the following command:
```bash
sudo curl -L https://github.com/docker/compose/releases/download/v2.20.2/docker-compose-`uname -s`-`uname -m` -o /usr/local/bin/docker-compose
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

## Part III: Setup LibreChat

### **1. Clone down the repo**
From the *droplet* commandline (as your user, not root):

```bash
# clone down the repository
git clone https://github.com/danny-avila/LibreChat.git

# enter the project directory
cd LibreChat/
``` 

### **2. Create a global environment file.**
The default values are enough to get you started and running the app, allowing you to provide your credentials from the web app.

```bash
# Copies the example file as your global env file
cp .env.example .env
```

However, if you'd like to provide any credentials for all users of your instance to consume, you can add them to the .env file as follows:

```bash
nano .env

# then, add your credentials
OPENAI_API_KEY=sk-yourKey
```

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

### **3. Start docker, and then run the installation/update script**

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

>If you are setting up a domain to be used with LibreChat, this compose file is using the nginx file located in client/nginx.conf. Instructions on this below in part V.

### **4. Once the app is running, you can access it at `http://yourserverip`**

### Go back to the DigitalOcean droplet page to get your server ip, copy it, and paste it into your browser!

![image](https://github.com/danny-avila/LibreChat/assets/110412045/d8bbad29-6015-46ec-88ce-a72a43d8a313)


### Sign up, log in, and enjoy your own privately hosted, remote LibreChat :)

![image](https://github.com/danny-avila/LibreChat/assets/110412045/85070a54-eb57-479f-8011-f63c14116ee3)

![image](https://github.com/danny-avila/LibreChat/assets/110412045/b3fc2152-4b6f-46f9-81e7-4200b76bc468)

## Part IV: Updating LibreChat

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

## Part V: Editing the NGINX file (for custom domains and advanced configs)

In case you would like to edit the NGINX file for whatever reason, such as pointing your server to a custom domain, use the following:

```bash
# First, stop the active instance if running
npm run stop:deployed

# now you can safely edit
nano client/nginx.conf
```

I won't be walking you through custom domain setup or any other changes to NGINX, you can look into the [Cloudflare setup guide](./cloudflare.md) to get you started with custom domains.

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

## Part VI: Use the Latest Stable Release instead of Latest Main Branch

By default, this setup will pull the latest updates to the main branch of Librechat. If you would rather have the latest "stable" release, which is defined by the [latest tags](https://github.com/danny-avila/LibreChat/releases), you will need to edit deploy-compose.yml and commit your changes exactly as above in Part V.

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

### Note: If you're still having trouble, before creating a new issue, please search for similar ones on our [#issues thread on our discord](https://discord.gg/weqZFtD9C4) or our [troubleshooting discussion](https://github.com/danny-avila/LibreChat/discussions/categories/troubleshooting) on our Discussions page. If you don't find a relevant issue, feel free to create a new one and provide as much detail as possible.
