# Hetzner Ubuntu Setup

*These instructions are designed for someone starting from scratch for a Ubuntu Installation. You can skip to any point that is useful for you.*

## Starting from Zero:

### 1. Login to Hetzner Cloud Console (https://console.hetzner.cloud/projects) and Create a new Ubuntu 20 Project with 4GB Ram. Do not worry about SSH keys *yet*. 

Hetzner will email you the root password. 

### 2. Once you have that, you can login with any SSH terminal with:

```
ssh root@<yourserverip>
```

### 3. Once you have logged in, immediately create a new, non-root user:

```
adduser <yourusername>
usermod -aG sudo <yourusername>
```

### 4. Make sure you have done this correctly by double-checking you have sudo permissions:

```
getent group sudo | cut -d: -f4
```

Now, quit the terminal connection.

### 5. Create a local ssh key:

```
ssh-keygen -t ed25519
```

Copy the key from your local computer to the server:
```
ssh-copy-id -i <locationto>/id_rsa.pub <yourusername>@<yourserverip>
```

And then login to the server with that key:
```
ssh <yourusername>@<yourserverip>
```

When you login, now and going forward, it will ask you for the password for your ssh key now, not your user password. Sudo commands will always want your user password.

### 6. Add SSH to the universal server firewall and activate it.

- Run `sudo ufw allow OpenSSH`
- Run `sudo ufw enable`


### 7. Then, we need to install docker, update the system packages, and reboot the server:
```
sudo apt install docker
sudo apt install docker-compose
sudo apt update
sudo apt upgrade
sudo reboot
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
git clone https://github.com/danny-avila/LibreChat.git
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
