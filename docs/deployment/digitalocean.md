# Digital Ocean (Ubuntu/Docker) Setup

>These instructions are designed for someone starting from scratch for a Docker Installation on a remote Ubuntu server. You can skip to any point that is useful for you.

>There are many ways to go about this, but I will present to you the easiest methods I'm aware of. These configurations can vary based on your liking or needs.

Digital Ocean is a great option for personal use, since you can benefit off a free [$200 credit](https://m.do.co/c/4486923fcf00) as described below, and in any case, one of the cheapest tiers will work for LibreChat in a low-stress (small amount of users) environment. Should your resource needs increase, there are several, plug-and-play options for you to upgrade very easily.

Digital Ocean is also my personal preferred choice for testing deployment, as it comes with useful resource monitoring/console access tools right out of the box.

**Using Digital Ocean will directly support the project by helping me cover the test deployment costs with credits! Click on this banner below for a $200 credit (available for 60 days) and to directly support LibreChat!**

[![DigitalOcean Referral Badge](https://web-platforms.sfo2.cdn.digitaloceanspaces.com/WWW/Badge%201.svg)](https://www.digitalocean.com/?refcode=4486923fcf00&utm_campaign=Referral_Invite&utm_medium=Referral_Program&utm_source=badge)

## Starting from Zero:

### 1. [Click here](https://m.do.co/c/4486923fcf00) or on the banner above to sign up. 

Once you're logged in, you will be required to create a project. 

Server instances are called **"droplets"** in digitalocean, and they are organized under **"Projects."**

Under your project, create a new droplet.

Adjust these settings based on your needs, as I'm selecting the bare minimum/cheapest options that will work.

- **Choose Region/Datacenter:** closest to you and your users
- **Choose an image:** Ubuntu 22.04 (LTS) x64
- **Choose Size:** Shared CPU, Basic Plan
       - CPU options: Regular, $6/mo option (1 GB RAM / 1 CPU / 25 GB SSD / 1000 GB transfer)
       - No additional storage       
- **Choose Authentication Method:** Password option is easiest but up to you
       - Alternatively, you can setup traditional SSH. The [Hetzner guide](./hetzner_ubuntu.md) has good instructions for this that can apply here
- **Recommended:** Add improved metrics monitoring and alerting (free)
       - You might be able to get away with the $4/mo option by not selecting this, but not yet tested
- **Finalize Details:** 
       - Change the hostname to whatever you like, everything else I leave default (1 droplet, no tags)
       - Finally, click "Create Droplet"


### 2. Access your droplet console

From the project page, click on the 3-dots (hamburger) icon and click "Access Console"

Launching the Droplet console is the easiest method but you can also SSH if you set it up in the previous step.


### 3. Once you have logged in, immediately create a new, non-root user:

```bash
adduser <yourusername>
# you will then be prompted for a password and user details

usermod -aG sudo <yourusername>
```

**Make sure you have done this correctly by double-checking you have sudo permissions:**

```bash
getent group sudo | cut -d: -f4
```

**Switch to the new user**

```bash
su - <yourusername>
```

### 4. Then, we need to install docker, update the system packages, and reboot the server:

Notes: 

- If using droplet console, you will get a purple screen asking you which services to restart.
       - You can safely select the default option each time and press ENTER whenever you see them.
- Respond with `Y` for all yes/no terminal prompts


```bash
sudo apt install docker
sudo apt install docker-compose
sudo apt update
sudo apt upgrade
sudo reboot
```

Optional but recommended: you can run the following command so you don't have to prepend `sudo` to docker commands:
```bash
sudo usermod -aG docker <yourusername>
```

After rebooting, if using the browser droplet console, you can click reload to get back into the console.

You should once again switch to the user you setup.

```bash
su - <yourusername>
```

### 5. As part of this guide, I will recommend you have git and npm installed:

Though not technically required, having git and npm will make installing/updating very simple:

```bash
sudo apt install git
sudo apt install nodejs npm
```

You can confirm they installed successfully with the following:

```bash
git --version
node -v
npm -v
```

**Ok, now that you have set up the SERVER, you will need to get all your tokens/apis/etc in order:**

---

## Tokens/Apis/etc:
- Make sure you have all the needed variables for the following before moving forward
### [Get Your API keys and Tokens](../install/apis_and_tokens.md) (Required)
- You must set up at least one of these tokens or APIs to run the app.
### [User/Auth System](../install/user_auth_system.md) (Optional)
- How to set up the user/auth system and Google login.
### [Plugins](../features/plugins/introduction.md)
- Optional plugins available to enhance the application.

---

## Using Docker to Install the Service

### 1. **Recommended: [Docker Install](../install/docker_install.md)**
From the *server* commandline (as your user, not root):

```
# clone down the repository
git clone https://github.com/danny-avila/LibreChat.git

# enter the project directory
cd LibreChat/
```

Edit your docker-compose.yml to endure you have the correct environment variables:

```
nano docker-compose.yml
```

```
       VITE_APP_TITLE: LibreChat # default, change to your desired app >
       VITE_SHOW_GOOGLE_LOGIN_OPTION: 'false'  # default, change to true if you want to show google login
```       

### 2. Create a global environment file and open it up to begin adding the tokens/keys you prepared in the PreReqs section.
```
cp .env.example .env
nano .env
```

### 3. In addition to adding all your api tokens and other tokens that you prepared above, change:

```
HOST=Localhost 
```
to 
```
HOST=<yourserverip>
```

### 4. Since you're using docker, you can also change the following:

```
SEARCH=true
MEILI_HOST=meilisearch
MEILI_HTTP_ADDR=meilisearch
```

### 5. After everything file has been updated, run  `docker-compose build` then `docker-compose up`


**NOTE: You may need to run these commands with sudo permissions.**

## Once the app is running, you can access it at http://yourserverip:3080

It is safe to close the terminal -- the docker app will continue to run.

*To disable external signups, after you have created your admin account, make sure you set 
```
ALLOW_REGISTRATION:False 
```

---

### Note: If you're still having trouble, before creating a new issue, please search for similar ones on our [#issues thread on our discord](https://discord.gg/weqZFtD9C4) or our [troubleshooting discussion](https://github.com/danny-avila/LibreChat/discussions/categories/troubleshooting) on our Discussions page. If you don't find a relevant issue, feel free to create a new one and provide as much detail as possible.
