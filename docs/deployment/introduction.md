---
title: Deployment
description: 🌐 starting point for deploying the LibreChat application across various environments and platforms.
weight: -20
---

# Comprehensive Deployment Guide for LibreChat

Ahoy, brave digital explorers and savvy code wranglers! Welcome to the fantastical journey of deploying LibreChat, where magic meets machinery, and dreams become digital reality. Strap on your virtual boots and hoist the sails; an adventure awaits in the boundless realms of the cloud!

That is to say... Here, you'll learn how to seamlessly launch LibreChat across diverse environments tailored to your requirements.

## Cloud Vendor Integration and Configuration

The integration level with cloud vendors varies: from platforms enabling single-click LibreChat deployments like [Zeabur](zeabur.md), through platforms leveraging Infrastructure as Code tools such as [Azure with Terraform](azure-terraform.md), to more traditional VM setups requiring manual configuration, exemplified by [DigitalOcean](digitalocean.md), [Linode](linode.md), and [Hetzner](hetzner_ubuntu.md).

## Essential Security Considerations

Venturing into the global digital wilderness unveils untold dangers: marauding cyber-dragons and shadowy data thieves. Arm yourself with the enchanted shield of HTTPS, and conjure the SSL wards to protect your digital dominion from the dark sorcery of data breaches.

When deploying applications globally, it’s paramount to safeguard your setup. Key considerations include enabling HTTPS to encrypt data in transit, understanding the global accessibility implications, and ensuring secure configuration. So if you select Iaas or Tunnel service for your deployment, you will probably need reverse proxy such as Nginx. don't know what is nginx and what it is used for? See [Nginx Guide)](nginx.md)

# Choosing the Cloud vendor (e.g. platform)

Choosing a cloud vendor, for the "real deployment" is crucial as it impacts cost, performance, security, and scalability. You should consider factors such as data center locations, compliance with industry standards, compatibility with existing tools, and customer support.

There is a lot of options that differ in many aspects. In this section you can find some options that the team and the community uses that can help you in your first deployment.
Once you gain more knowledge on your application usage and audience you will probably be in a position to decide what cloud vendor fits you the best for the long run.

As said the cloud providers / platforms differ in many aspects. For our purpose we can assume that in our context your main concerns is will ease of use, security and (initial) cost. In case that you have more concerns like scaling, previous experience with any of the platforms or any other specific feature then you probably know better what platform fit's you and you can jump directly to the information that you are seeking without following any specific guide.

## Deployment "options" & Specific guides overview

The list goes from the more effort more controlled, to the lease effort less controlled.
Generally speaking Iaas will consume more time and expertise then Iac, Iac more the PaaS etc.

### 1. Iaas - VM + Docker compose installation Guide

IaaS (Infrastructure as a Service): Provides fundamental computing resources like virtual servers, network, and storage on a pay-per-use basis.

- [DigitalOcean](digitalocean.md): User-friendly interface with predictable pricing.
- [Linode](linode.md): Renowned for excellent customer support and straightforward pricing.
- [Hetzner](hetzner_ubuntu.md): Prioritizes privacy and cost-effectiveness, ideal for European-centric deployments.

#### For Iaas we recommend Docker Compose

**Why Docker Compose?** We advocate the use of Docker Compose to ensure a seamless and uniform deployment experience across all platforms. This guide elucidates each step, ensuring clarity and ease of understanding throughout the deployment lifecycle.

##### Beware there are 2 versions of Docker Compose in the repo

Beware that LibraChat has to docker compose versions

1. **Development Oriented docker compose `docker-compose.yml`**
2. **Deployment Oriented docker compose `deploy-compose.yml`**

The main difference is that `deploy-compose.yml` includes nginx in the docker (and therefore it's nginx configuration is docker internal).

don't know what is nginx and what it is used for? See [Reverse Proxy Guide)](nginx.md)

### 2. IaC - Terraform

IaC ("Infrastructure as Code"): managing and provisioning computing infrastructures through machine-readable definition files, rather than physical hardware configuration or interactive configuration tools. This practice supports reproducibility, disposability, and scalability in modern cloud environments.

- [Azure](azure-terraform.md): Comprehensive services suitable for enterprise-level deployments

**Important Note**

- Digital Ocean, Linode, Hetzner also support IaC. But currently we don't have a dedicated guide for this.
  So you are welcome to try it with the Azure Guide and help us update it to make it Terraform IaC guide for all platforms.

### 3. PaaS (Platform as a Service)

PaaS (Platform as a Service): Offers a development and deployment environment in the cloud, with resources enabling users to deliver simple cloud-based apps to sophisticated enterprise applications.

- [Hugging Face](huggingface.md): Tailored for machine learning and NLP projects.
- [Render](render.md): Simplifies deployments with integrated CI/CD pipelines.
- [Heroku](heroku.md): Optimal for startups and quick deployment scenarios.

### 4. Feature PaaS

- [Meilisearch in Render](meilisearch_in_render.md): Quick setup guide for integrating the fast search engine with LibreChat on Render.

### 5. One Click Deployment of PaaS

- [Zeabur](zeabur.md): Pioneering effortless one-click deployment solutions.

## Other Categories

### 1. Tunneling Services

Tunneling services allow you to expose a local development server to the internet, making it accessible via a public URL. This is particularly useful for sharing work, testing, and integrating with third-party services. It allows you to deploy your development computer for testing or for on-prem installation.

- [Ngrok](ngrok.md): Facilitates secure local tunneling to the internet.
- [Cloudflare](cloudflare.md): Enhances web performance and security.

### 2. DNS Service

- Cloudflare Domain Setup part of the Cloudflare guide (we should make it DNS service and put Cloudflare as the provider ...)

# The Voyage Commences

Before you chart your course through the cloud archipelago, ponder your heart's desires: the serenity of ease, the bastion of security, or the treasure trove of affordability. Your chosen path will illuminate the way to your destined cloud realm.

# Embarkation on the Legendary Deployment

With a quill dipped in starlight, mark your chosen path and embark upon the legendary deployment of LibreChat. May the digital winds be ever in your favor, as you navigate the binary seas and uncover the treasures of the cloud.

Remember, our community is here to assist. Should you encounter challenges or have queries, our [Discord channel](https://discord.librechat.ai) and [troubleshooting discussion](https://github.com/danny-avila/LibreChat/discussions/categories/troubleshooting) are excellent resources for support and advice.

Happy deploying!
