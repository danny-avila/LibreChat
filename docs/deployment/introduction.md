---
title: 🌐 Deployment Introduction
description: Introduction to deploying LibreChat, offering a comparison of various hosting and network services
weight: -10
---

# Deployment Introduction

Welcome to the introductory guide for deploying LibreChat. This document provides an initial overview, featuring a comparison table and references to detailed guides, ensuring a thorough understanding of deployment strategies.

In this guide, you will explore various options to efficiently deploy LibreChat in a variety of environments, customized to meet your specific requirements.

## Comparative Table

> Note that the "Recommended" label indicates that these services are well-documented, widely used within the community, or have been successfully deployed by a significant number of users. As a result, we're able to offer better support for deploying LibreChat on these services

### Hosting Services

| **Service**                        | **Domain**                | **Pros**                                                   | **Cons**                               | **Comments**                                            |      **Recommended**    |
|------------------------------------|---------------------------|------------------------------------------------------------|----------------------------------------|---------------------------------------------------------|-------------------------|
| [DigitalOcean](./digitalocean.md)  | Cloud Infrastructure      | Intuitive interface, stable pricing                        | Smaller network footprint              | Optimal for enthusiasts & small to medium businesses    | ✅ Well Known, Reliable |
| [HuggingFace](./huggingface.md)   | AI/ML Solutions           | ML/NLP specialization                                      | Focused on ML applications             | Excellent for AI/ML initiatives                         | ✅ Free                 |
| [Azure](./azure-terraform.md)         | Cloud Services            | Comprehensive offerings, Microsoft ecosystem integration   | Can be complex, may incur higher costs | Ideal for large enterprises                             | ✅ Pro                  |
| [Railway](./railway.md)       | App Deployment            | Simplified app deployment                                  | Emerging service with limited info     | Further evaluation recommended                          | ✅ Easy                 |
| [Linode](./linode.md)        | Cloud Hosting             | Responsive support, clear pricing                          | Fewer specialized services             | Comparable to DigitalOcean                              |                         |
| [Hetzner](./hetzner_ubuntu.md)       | Data Hosting              | Emphasizes privacy, economical                             | Primarily European servers             | Suitable for Europe-centric operations                  |                         |
| [Heroku](./heroku.md)        | Platform as a Service     | User-friendly, scalable                                    | Higher cost potential, less flexibility| A good starting point for startups                      |                         |
| [Zeabur](./zeabur.md)        | Tech Startups             | Streamlines developer deployment, scalable                 | Limited information due to newness     | Worth exploring for new projects                        |                         |

### Network Services 

| **Service**   | **Domain**                | **Pros**                                                   | **Cons**                                         | **Comments**                                   |
|---------------|---------------------------|------------------------------------------------------------|--------------------------------------------------|------------------------------------------------|
| [Cloudflare](./cloudflare.md)    | Web Performance & Security| Global CDN, DDoS protection, ease of use                   | Limited free tier, customer support              | Top choice for security enhancements           |
| [Ngrok](./ngrok.md)         | Secure Tunneling          | Easy to use, free tier available, secure tunneling         | Requires client download, complex domain routing | Handy for local development tests              |
| [Nginx](./nginx.md)         | Web Server                | High performance, stability, resource efficiency           | Manual setup, limited extensions                 | Widely used for hosting due to its performance |

**Cloudflare** is known for its extensive network that speeds up and secures internet services, with an intuitive user interface and robust security options on premium plans.

**Ngrok** is praised for its simplicity and the ability to quickly expose local servers to the internet, making it ideal for demos and testing.

**Nginx** is a high-performance web server that is efficient in handling resources and offers stability. It does, however, require manual setup and has fewer modules and extensions compared to other servers.

## Cloud Vendor Integration and Configuration

The integration level with cloud vendors varies: from platforms enabling single-click LibreChat deployments like [Railway](./railway.md), through platforms leveraging Infrastructure as Code tools such as [Azure with Terraform](azure-terraform.md), to more traditional VM setups requiring manual configuration, exemplified by [DigitalOcean](digitalocean.md), [Linode](linode.md), and [Hetzner](hetzner_ubuntu.md).

## Essential Security Considerations

Venturing into the digital landscape reveals numerous threats to the security and integrity of your online assets. To safeguard your digital domain, it is crucial to implement robust security measures.

When deploying applications on a global scale, it is essential to consider the following key factors to ensure the protection of your digital assets:

1. Encrypting data in transit: Implementing HTTPS with SSL certificates is vital to protect your data from interception and eavesdropping attacks.
2. Global accessibility implications: Understand the implications of deploying your application globally, including the legal and compliance requirements that vary by region.
3. Secure configuration: Ensure that your application is configured securely, including the use of secure protocols, secure authentication, and authorization mechanisms.

If you choose to use IaaS or Tunnel services for your deployment, you may need to utilize a reverse proxy such as [Nginx](./nginx.md), [Traefik](./traefik.md) or [Cloudflare](./cloudflare.md) to name a few.

Investing in the appropriate security measures is crucial to safeguarding your digital assets and ensuring the success of your global deployment.

## Choosing the Cloud vendor (e.g. platform)

Choosing a cloud vendor, for the "real deployment" is crucial as it impacts cost, performance, security, and scalability. You should consider factors such as data center locations, compliance with industry standards, compatibility with existing tools, and customer support.

There is a lot of options that differ in many aspects. In this section you can find some options that the team and the community uses that can help you in your first deployment.
Once you gain more knowledge on your application usage and audience you will probably be in a position to decide what cloud vendor fits you the best for the long run.

As said the cloud providers / platforms differ in many aspects. For our purpose we can assume that in our context your main concerns is will ease of use, security and (initial) cost. In case that you have more concerns like scaling, previous experience with any of the platforms or any other specific feature then you probably know better what platform fit's you and you can jump directly to the information that you are seeking without following any specific guide.

## Choosing the Right Deployment Option for Your Needs

The deployment options are listed in order from most effort and control to least effort and control

> Each deployment option has its advantages and disadvantages, and the choice ultimately depends on the specific needs of your project.

### 1. IaaS (Infrastructure as a Service)

Infrastructure as a Service (IaaS) refers to a model of cloud computing that provides fundamental computing resources, such as virtual servers, network, and storage, on a pay-per-use basis. IaaS allows organizations to rent and access these resources over the internet, without the need for investing in and maintaining physical hardware. This model provides scalability, flexibility, and cost savings, as well as the ability to quickly and easily deploy and manage infrastructure resources in response to changing business needs.

- [DigitalOcean](digitalocean.md): User-friendly interface with predictable pricing.
- [Linode](linode.md): Renowned for excellent customer support and straightforward pricing.
- [Hetzner](hetzner_ubuntu.md): Prioritizes privacy and cost-effectiveness, ideal for European-centric deployments.

#### For Iaas we recommend Docker Compose

**Why Docker Compose?** We recommend Docker Compose for consistent deployments. This guide clearly outlines each step for easy deployment: [Ubuntu Docker Deployment Guide](./docker_ubuntu_deploy.md)

**Note:** There are two docker compose files in the repo

1. **Development Oriented docker compose `docker-compose.yml`**
2. **Deployment Oriented docker compose `deploy-compose.yml`**

The main difference is that `deploy-compose.yml` includes Nginx, making its configuration internal to Docker.

> Look at the [Nginx Guide](nginx.md) for more information

### 2. IaC (Infrastructure as Code)

Infrastructure as Code (IaC) refers to the practice of managing and provisioning computing infrastructures through machine-readable definition files, as opposed to physical hardware configuration or interactive configuration tools. This approach promotes reproducibility, disposability, and scalability, particularly in modern cloud environments. IaC allows for the automation of infrastructure deployment, configuration, and management, resulting in faster, more consistent, and more reliable provisioning of resources.

- [Azure](azure-terraform.md): Comprehensive services suitable for enterprise-level deployments

**Note:** Digital Ocean, Linode, Hetzner also support IaC. While we lack a specific guide, you can try to adapt the adapt the Azure Guide for Terraform and help us contribute to its enhancement.

### 3. PaaS (Platform as a Service)

Platform as a Service (PaaS) is a model of cloud computing that offers a development and deployment environment in the cloud. It provides a platform for developers to build, test, and deploy applications, without the need for managing the underlying infrastructure. PaaS typically includes a range of resources such as databases, middleware, and development tools, enabling users to deliver simple cloud-based apps to sophisticated enterprise applications. This model allows for faster time-to-market, lower costs, and easier maintenance and scaling, as the service provider is responsible for maintaining the infrastructure, and the customer can focus on building, deploying and managing their applications.

- [Hugging Face](huggingface.md): Tailored for machine learning and NLP projects.
- [Render](render.md): Simplifies deployments with integrated CI/CD pipelines.
- [Heroku](heroku.md): Optimal for startups and quick deployment scenarios.

### 4. One Click Deployment (PaaS)

- [Railway](./railway.md): Popular one-click deployment solution
- [Zeabur](zeabur.md): Pioneering effortless one-click deployment solutions.

## Other / Network Services

### 1. Tunneling

Tunneling services allow you to expose a local development server to the internet, making it accessible via a public URL. This is particularly useful for sharing work, testing, and integrating with third-party services. It allows you to deploy your development computer for testing or for on-prem installation.

- [Ngrok](ngrok.md): Facilitates secure local tunneling to the internet.
- [Cloudflare](cloudflare.md): Enhances web performance and security.

### 2. DNS Service

- Cloudflare DNS service is used to manage and route internet traffic to the correct destinations, by translating human-readable domain names into machine-readable IP addresses. Cloudflare is a provider of this service, offering a wide range of features such as security, performance, and reliability. The Cloudflare DNS service provides a user-friendly interface for managing DNS records, and offers advanced features such as traffic management, DNSSEC, and DDoS protection.

see also: [Cloudflare Guide](./cloudflare.md)

## Conclusion

In conclusion, the introduction of our deployment guide provides an overview of the various options and considerations for deploying LibreChat. It is important to carefully evaluate your needs and choose the path that best aligns with your organization's goals and objectives. Whether you prioritize ease of use, security, or affordability, our guide provides the necessary information to help you successfully deploy LibreChat and achieve your desired outcome. We hope that this guide will serve as a valuable resource for you throughout your deployment journey.

Remember, our community is here to assist. Should you encounter challenges or have queries, our [Discord channel](https://discord.librechat.ai) and [troubleshooting discussion](https://github.com/danny-avila/LibreChat/discussions/categories/troubleshooting) are excellent resources for support and advice.

