# Digital Ocean (Ubuntu/Docker) Setup

>These instructions are designed for someone starting from scratch for a Docker Installation on a remote Ubuntu server. You can skip to any point that is useful for you.

**There are many ways to go about this, but I will present to you the best/easiest methods I'm aware of. These configurations can vary based on your liking or needs.**

Digital Ocean is a great option for deployment: you can benefit off a free [$200 credit](https://m.do.co/c/4486923fcf00), and one of the cheapest tiers ($6/mo) will work for LibreChat in a low-stress, minimal-user environment. Should your resource needs increase, you can always upgrade very easily.

Digital Ocean is also my preferred choice for testing deployment, as it comes with useful resource monitoring and server access tools right out of the box.

**Using the following Digital Ocean link will directly support the project by helping me cover deployment costs with credits! Click on this banner below to get a $200 credit (available for 60 days) and to directly support LibreChat!**

[![DigitalOcean Referral Badge](https://web-platforms.sfo2.cdn.digitaloceanspaces.com/WWW/Badge%201.svg)](https://www.digitalocean.com/?refcode=4486923fcf00&utm_campaign=Referral_Invite&utm_medium=Referral_Program&utm_source=badge)

## Part I: Starting from Zero:

**1. [Click here](https://m.do.co/c/4486923fcf00) or on the banner above to get started on DigitalOcean**

Once you're logged in, you will be greeted with a [nice welcome screen](https://cloud.digitalocean.com/welcome).

**a) Click on Explore our control panel or simply navigate to the [Projects page](https://cloud.digitalocean.com/projects)**

Server instances are called **"droplets"** in digitalocean, and they are organized under **"Projects."**

**b) Click on "Spin up a Droplet" to start the setup**

Adjust these settings based on your needs, as I'm selecting the bare minimum/cheapest options that will work.

- **Choose Region/Datacenter:** closest to you and your users
- **Choose an image:** Ubuntu 22.04 (LTS) x64
- **Choose Size:** Shared CPU, Basic Plan
       - CPU options: Regular, $6/mo option ($0.009/hour, 1 GB RAM / 1 CPU / 25 GB SSD / 1000 GB transfer)
       - No additional storage
- **Choose Authentication Method:** Password option is easiest but up to you
       - Alternatively, you can setup traditional SSH. The [Hetzner guide](./hetzner_ubuntu.md) has good instructions for this that can apply here
- **Recommended:** Add improved metrics monitoring and alerting (free)
       - You might be able to get away with the $4/mo option by not selecting this, but not yet tested
- **Finalize Details:** 
       - Change the hostname to whatever you like, everything else I leave default (1 droplet, no tags)
       - Finally, click "Create Droplet"

The droplet will now spin up with a progress bar.

**2. Access your droplet console**

Once it's spun up, click on the droplet page and click on the Console link on the right-hand side to start up the console.

Launching the Droplet console this way is the easiest method but you can also SSH if you set it up in the previous step.

To keep this guide simple, I will keep it easy and continue with the droplet console. Here is an [official DigitalOcean guide for SSH](https://docs.digitalocean.com/products/droplets/how-to/connect-with-ssh/) if you are interested.

**3. Once you have logged in, immediately create a new, non-root user:**

```bash
# Note: you should remove the greater/less than signs anytime you see them in this guide
# example: adduser danny
adduser <yourusername>
# you will then be prompted for a password and user details

# once you are done, run the following command to elevate the user
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

---

### Part II: Installing Docker, Docker Compose, git & npm:

There are many ways to setup Docker on Debian systems. I'll walk you through the best and the recommended way [based on this guide](https://www.smarthomebeginner.com/install-docker-on-ubuntu-22-04/).

>Note that the "Best" way for Ubuntu docker installation does not mean the "fastest" or the "easiest". It means, the best way to install it for long-term benefit (i.e. faster updates, security patches, etc.).

**1. Update and Install Docker Dependencies**
First, let's update our packages list and install the required docker dependencies.

```bash
sudo apt update
```
Then, use the following command to install the dependencies or pre-requisite packages.

```bash
sudo apt install apt-transport-https ca-certificates curl software-properties-common gnupg lsb-release
```

**Notes:**
- Input "Y" for all [Y/n] (yes/no) terminal prompts throughout this entire guide.
- After the first [Y/n] prompt, you will get the first of a few purple screens asking to restart services.
       - Each time this happens, you can safely press ENTER for the default, already selected options
- If at any point your droplet console disconnects, do the following and then pick up where you left off:
       - Access the console again as indicated above
       - Switch to the user you created with `su - <yourusername>`

**2. Add Docker Repository to APT Sources**
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

**3. Install Docker on Ubuntu/Debian Linux**
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

After rebooting, if using the browser droplet console, you can click reload to get back into the console.

>Reminder: Any time you reboot with `sudo reboot`, you should switch to the user you setup as before with `su - <yourusername>`.

**4. Verify that Docker is Running on Ubuntu**
There are many ways to check if Docker is running on Ubuntu. One way is to use the following command:
```bash
sudo systemctl status docker
```
You should see an output that says active for status.

Exit this log by pressing CTRL (or CMD) + C.

**5. Install the Latest Version of Docker Compose**

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


**6. As part of this guide, I will recommend you have git and npm installed:**

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

> Note: this will install some pretty old versions, npm in particular. For our purposes, this is fine, but this is just a heads up in case you try other things with node in this instance. Do look up a guide for getting the latest versions of the above as necessary.

**Ok, now that you have set up the Droplet, you will now setup the app itself**

---

## Part III: Setup LibreChat

**1. Clone down the repo**
From the *droplet* commandline (as your user, not root):

```bash
# clone down the repository
git clone https://github.com/danny-avila/LibreChat.git

# enter the project directory
cd LibreChat/
``` 

**2. Create a global environment file.**
The default values are enough to get you started and running the app! API credentials can be provided when accessing the web app.

```bash
# Copies the example file as your global env file
cp .env.example .env
```

That's it!

For thorough configuration, however, you should edit your .env file as needed, and do read the comments in the .env file and the resources below.

```bash
# if editing the .env file
nano .env
```

This is one such env variable to be mindful of. This disables external signups, in case you would like to set it after you've created your account.
```shell
ALLOW_REGISTRATION=false 
```

**Resources:**
- [Tokens/Apis/etc](../install/apis_and_tokens.md)
- [User/Auth System](../install/user_auth_system.md)

**3. After all of the above, start docker, and then run the installation/update script**

```bash
# should already be running, but just to be safe
sudo systemctl start docker

# confirm docker is running
docker info
```

```bash
sudo docker-compose -f ./deploy-compose.yml up -d
```

It's safe to close the terminal if you wish -- the docker app will continue to run.

> Note: this is using a special compose file optimized for this deployed environment. If you would like more configuration here, you should inspect the deploy-compose.yml and Dockerfile.multi files to see how they are setup. If you are setting up a domain to be used with LibreChat, this compose file is using the nginx file located in client/nginx.conf. I have some more instructions on what you would need to edit below in part V.

**4. Once the app is running, you can access it at http://yourserverip**

Go back to the DigitalOcean droplet page to get your server ip, copy it, and paste it into your browser!

Sign up, log in, and enjoy your own privately hosted, remote LibreChat :)

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

> This simply runs `docker-compose -f ./deploy-compose.yml down --volumes`

**Starting the docker container**

```bash
npm run start:deployed
```

> This simply runs `docker-compose -f ./deploy-compose.yml up -d`

**Check active docker containers**

```bash
docker ps
```

---

### Note: If you're still having trouble, before creating a new issue, please search for similar ones on our [#issues thread on our discord](https://discord.gg/weqZFtD9C4) or our [troubleshooting discussion](https://github.com/danny-avila/LibreChat/discussions/categories/troubleshooting) on our Discussions page. If you don't find a relevant issue, feel free to create a new one and provide as much detail as possible.
