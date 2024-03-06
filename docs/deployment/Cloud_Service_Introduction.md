---
title: Deployment
description: 🌐 starting point for deploying the LibreChat application across various environments and platforms.
weight: -20
---

# Deployment Guides for LibreChat Open Source Application

This documentation aims to provide you with a clear and concise starting point for deploying the LibreChat application across various environments and platforms.

Please note that this guide does not aim to replace the official documentation provided by the deployment services listed below. Instead, it serves to complement those resources by offering a consolidated jumpstart into the deployment process. It's important to recognize that the platforms detailed in this guide are not directly comparable, as they originate from different domains and cater to varying needs.

You will find that some deployment methods involve installing on Ubuntu, while others integrate directly with the platform's native offerings. It's also worth mentioning that, in the current version of these guides, there may be overlapping or nonidentical clones of the deployment process—even for parts that are essentially the same across different platforms.

We are aware of this redundancy and plan to streamline the documentation in the future. The goal is to create a unified guide for the common aspects of the deployment process, reserving the specific guides for the unique elements inherent to each platform. We encourage the community to contribute to this effort and help us refine and enhance these guides.

Below is a comparative overview of the various deployment options available for LibreChat, highlighting the main advantages and disadvantages of each. This table is intended as a starting point to help you choose the best environment for your specific requirements.

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

# Essential Security Tips for First-Time Web Deployment

Welcome to your first journey into deploying a web application. Here are some essential points to consider for ensuring the security and integrity of your deployment:

1. **Worldwide Accessibility**: Once your application is deployed, it becomes accessible globally. This accessibility includes potential threats from blackhat hackers who may seek to exploit vulnerabilities within your system.

2. **Express.js and HTTPS**: The application's backend utilizes Express.js, which, by default, does not support HTTPS. HTTPS is crucial for securing your application as it encrypts data in transit. Express.js is designed to operate behind a reverse proxy like Nginx, which can provide the necessary HTTPS support.

3. **The Dangers of HTTP**: Operating your application over HTTP (without SSL/TLS) exposes all transmitted data, including sensitive user information and API keys, making it vulnerable to interception by malicious entities. Always ensure your application communicates over HTTPS.

4. **Mandatory Use of HTTPS**: Never deploy your web application without HTTPS. The lack of encryption poses a severe risk to both your application's security and the privacy of your users.

5. **Setting Up HTTPS**: To implement HTTPS, you must configure a reverse proxy that handles HTTPS connections in front of your application. Tools such as Nginx or Apache are commonly used for this purpose. See instructions on setting up a secure reverse proxy in [reverse proxy guide)](NGINX_Deployment_Guide.md).

Remember, these guidelines are not exhaustive but serve as a starting point for securing your web deployment. Further steps should include regular security audits, updates, and adherence to best practices in web security.
