---
title: Deployment
description: 🌐 starting point for deploying the LibreChat application across various environments and platforms.
weight: -20
---

# Introduction to Deployment Guide for LibreChat

Welcome to the LibreChat deployment guide. This guide is crafted for both first-time deployers and seasoned professionals, aiming to streamline the process of setting up and launching LibreChat in your preferred environment.

Deploying a web application involves several steps from setting up the server to making the application accessible. For LibreChat, we currently highly recommend using Docker Compose for a smooth experience. This guide will walk you through all necessary steps, ensuring you understand the process.

# Cloud vendor integration level

Some of the platforms provide LibreChat integration and you can deploy with a click (e.g. Zeabur), some use Infrastructure as code tools (e.g. Terraform) to ease deployment and most provide you with a VM that you need to configure. This guide deals mainly with the issues related to the VM installation,

# 2 versions of Docker Compose

Beware that LibraChat has to docker compose versions

1. **Development Oriented docker compose `docker-compose.yml`**
2. **Deployment Oriented docker compose `deploy-compose.yml`**

The main difference is that `deploy-compose.yml` includes nginx in the docker (and therefore it's nginx configuration is docker internal).

don't know what is nginx and what it is used for? See [Reverse Proxy Guide)](NGINX_Deployment_Guide.md)

# Essential Security Tips for First-Time Web Deployment

While deploying application to the web there are some essential points to consider for ensuring the security and integrity of your deployment:

1. **Worldwide Accessibility**: Once your application is deployed, it becomes accessible globally. This accessibility includes potential threats from blackhat hackers who may seek to exploit vulnerabilities within your system, as well as attackers that might want to block your web access.

2. **Express.js and HTTPS**: The application's backend utilizes Express.js, which, by default, does not support HTTPS. HTTPS is crucial for securing your application as it encrypts data in transit. Express.js is designed to operate behind a reverse proxy like Nginx, which can provide the necessary HTTPS support.

3. **The Dangers of HTTP**: Operating your application over HTTP (without SSL/TLS) exposes all transmitted data, including sensitive user information and API keys, making it vulnerable to interception by malicious entities. Always ensure your application communicates over HTTPS.

4. **Mandatory Use of HTTPS**: Never deploy your web application without HTTPS. The lack of encryption poses a severe risk to both your application's security and the privacy of your users.

5. **Setting Up HTTPS**: To implement HTTPS, you must configure a reverse proxy that handles HTTPS connections in front of your application. Tools such as Nginx or Apache are commonly used for this purpose. See instructions on setting up a secure reverse proxy in [reverse proxy guide)](NGINX_Deployment_Guide.md).

Remember, these guidelines are not exhaustive but serve as a starting point for securing your web deployment. Further steps should include regular security audits, updates, and adherence to best practices in web security.

# Choosing the Cloud vendor (e.g. platform)

Choosing a cloud vendor, for the "real deployment" is crucial as it impacts cost, performance, security, and scalability. You should consider factors such as data center locations, compliance with industry standards, compatibility with existing tools, and customer support.

There is a lot of options that differ in many aspects. In this section you can find some options that the team and the community uses that can help you in your first deployment.
Once you gain more knowledge on your application usage and audience you will probably be in a position to decide what cloud vendor fits you the best for the long run.

# Deployment Guides for different cloud vendors

This documentation aims to provide you with a clear and concise starting point for deploying the LibreChat application across various environments and platforms, with ease.

Please note that this guide does not aim to replace the official documentation provided by the deployment services listed below. Instead, it serves to complement those resources by offering a consolidated jumpstart into the deployment process. It's important to recognize that the platforms detailed in this guide are not directly comparable, as they originate from different domains and cater to varying needs.

You will find that some deployment methods involve installing on Ubuntu using the docker compose, while others integrate directly with the platform's native offerings. It's also worth mentioning that, in the current version of these guides, there may be overlapping or nonidentical clones of the deployment process—even for parts that are essentially the same across different platforms.

We are aware of this redundancy and plan to streamline the documentation in the future. The goal is to create a unified guide for the common aspects of the deployment process, reserving the specific guides for the unique elements inherent to each platform. We encourage the community to contribute to this effort and help us refine and enhance these guides.

Below is a comparative overview of the various deployment platforms that are documented here, highlighting the main advantages and disadvantages of each platform. This table is intended as a starting point to help you choose the best environment for your specific requirements for your first deployment of LibreChat.

| **Service**  | **Domain**                  | **Pros**                                                   | **Cons**                                 | **Comments**                              |
| ------------ | --------------------------- | ---------------------------------------------------------- | ---------------------------------------- | ----------------------------------------- |
| DigitalOcean | Cloud Infrastructure        | User-friendly, predictable pricing                         | Less extensive global reach              | Ideal for SMBs                            |
| Linode       | Cloud Infrastructure        | Good customer support, transparent pricing                 | Limited advanced services                | Similar to DigitalOcean                   |
| Hetzner      | Cloud Infrastructure        | Strong privacy, cost-effective                             | Mainly European data centers             | Good for EU-based needs                   |
| Azure        | Cloud Infrastructure        | Extensive services, integration with Microsoft             | Complexity, potentially higher costs     | Suited for enterprise and Microsoft users |
| HuggingFace  | Development and Deployment  | Specializes in ML and NLP                                  | Niche for ML projects                    | Great for AI/ML projects                  |
| Render       | Development and Deployment  | Zero-config deployments, easy to use                       | Limited control over infrastructure      | Simple deployments                        |
| Heroku       | Development and Deployment  | Developer-friendly, easy scaling                           | Can be expensive, limited control        | Good for beginners and startups           |
| Cloudflare   | Networking and Security     | Enhances performance and security                          | Not a full cloud service provider        | Best for performance and security         |
| Ngrok        | Networking and Security     | Great for testing, easy to use                             | Limited to tunneling service             | Useful for local testing                  |
| Meilisearch  | Search and Database Service | Quick setup, fast search engine                            | Requires Render platform                 | For adding search to websites             |
| Zeabur       | New Startup                 | helps developers to deploy painlessly and scale infinitely | New Startup , Limited public information | Research further based on needs           |
