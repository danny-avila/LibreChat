---
title: 🦓 Zeabur 
description: Instructions for deploying LibreChat on Zeabur 
weight: -1
---
# Zeabur Deployment

This guide will walk you through deploying LibreChat on Zeabur.

## Sign up for a Zeabur account

If you don't have a Zeabur account, you need to sign up for one.
Visit [here](https://zeabur.com/login) and click on `Login with GitHub` to create an account and sign in.

![Sign up for a Zeabur account](https://github.com/danny-avila/LibreChat/assets/32828263/3e2d680d-c52a-46fb-a194-22306383c2d4)

## Deploy with button

Zeabur has already prepared a one-click deployment template for LibreChat, so you can start the deployment directly by clicking the button below without any additional configuration.

[![Deploy on Zeabur](https://zeabur.com/button.svg)](https://zeabur.com/templates/0X2ZY8)

In the template page, select the region where you want to deploy LibreChat, and then click the Deploy button to start the deployment.

![Select Region and Deploy](https://github.com/danny-avila/LibreChat/assets/32828263/3676170b-9d59-46bf-81ca-48a5c7f1d657)

## Bind a domain 

After the deployment is complete, you will find that there is a new project in your Zeabur account, which contains three services: a MongoDB, a Meilisearch, and a LibreChat.

![Project Detail](https://github.com/danny-avila/LibreChat/assets/32828263/7fed136c-0490-4df7-892e-43d681723d95)

To access your deployed LibreChat, you need to select the LibreChat service, click on the Network tab below, and then click Generate Domain to create a subdomain under .zeabur.app.

![Bind domain](https://github.com/danny-avila/LibreChat/assets/32828263/d324a759-9812-456c-a295-014184bf5e99)

## Conclusion

You can now access it by clicking the link.

![](https://github.com/danny-avila/LibreChat/assets/32828263/b3f64d10-d5c7-4b26-8414-fa772e8a51fd)

Congratulations! You've successfully deployed LibreChat on Zeabur.
