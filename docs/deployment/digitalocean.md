---
title: 🌊 DigitalOcean ✨(Recommended)
description: These instructions are designed for someone starting from scratch for a Docker Installation on a remote Ubuntu server using one of the cheapest tiers (6 USD/mo)
weight: -9
---

# Digital Ocean Setup

> These instructions + the docker compose guide are designed for someone starting from scratch for a Docker Installation on a remote Ubuntu server. You can skip to any point that is useful for you. There are probably more efficient/scalable ways, but this guide works really great for my personal use case.

**There are many ways to go about this, but I will present to you the best and easiest methods I'm aware of. These configurations can vary based on your liking or needs.**

Digital Ocean is a great option for deployment: you can benefit off a **free [200 USD credit](https://m.do.co/c/4486923fcf00)** (for 60 days), and one of the cheapest tiers (6 USD/mo) will work for LibreChat in a low-stress, minimal-user environment. Should your resource needs increase, you can always upgrade very easily.

Digital Ocean is also my preferred choice for testing deployment, as it comes with useful resource monitoring and server access tools right out of the box.

**Using the following Digital Ocean link will directly support the project by helping me cover deployment costs with credits!**

## **Click the banner to get a $200 credit and to directly support LibreChat!**

_You are free to use this credit as you wish!_

[![DigitalOcean Referral Badge](https://web-platforms.sfo2.cdn.digitaloceanspaces.com/WWW/Badge%201.svg)](https://www.digitalocean.com/?refcode=4486923fcf00&utm_campaign=Referral_Invite&utm_medium=Referral_Program&utm_source=badge)

_Note: you will need a credit card or PayPal to sign up. I'm able to use a prepaid debit card through PayPal for my billing_

## Table of Contents

- **[Part I: Starting from Zero](#part-i-starting-from-zero)**
  - [1. DigitalOcean signup](#1-click-here-or-on-the-banner-above-to-get-started-on-digitalocean)
  - [2. Access console](#2-access-your-droplet-console)
  - [3. Console user setup](#3-once-you-have-logged-in-immediately-create-a-new-non-root-user)
  - [4. Firewall Setup](#4-firewall-setup)
- **[Part II: Installing Docker & Other Dependencies](#part-ii-installing-docker-and-other-dependencies)**

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

This concludes the initial setup. For the subsequent steps, please proceed to the next guide:**[Ubuntu Docker Deployment Guide](./docker_ubuntu_deploy.md)**, which will walk you through the remaining installation process.

### Note: If you're still having trouble, before creating a new issue, please search for similar ones on our [#issues thread on our discord](https://discord.librechat.ai) or our [troubleshooting discussion](https://github.com/danny-avila/LibreChat/discussions/categories/troubleshooting) on our Discussions page. If you don't find a relevant issue, feel free to create a new one and provide as much detail as possible.
