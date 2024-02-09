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

![Sign up for a Zeabur account](https://i.imgur.com/aUuOcWg.png)

## Deploy with button

Zeabur has already prepared a one-click deployment template for LibreChat, so you can start the deployment directly by clicking the button below without any additional configuration.

[![Deploy on Zeabur](https://zeabur.com/button.svg)](https://zeabur.com/templates/0X2ZY8)

In the template page, select the region where you want to deploy LibreChat, and then click the Deploy button to start the deployment.

![Select Region and Deploy](https://i.imgur.com/cpfrA0k.png)

## Bind a domain 

After the deployment is complete, you will find that there is a new project in your Zeabur account, which contains three services: a MongoDB, a Meilisearch, and a LibreChat.

![Project Detail](https://i.imgur.com/4SRMoba.png)

To access your deployed LibreChat, you need to select the LibreChat service, click on the Network tab below, and then click Generate Domain to create a subdomain under .zeabur.app.

![Bind domain](https://i.imgur.com/2RabEIF.png)

## Conclusion

You can now access it by clicking the link.

![](https://i.imgur.com/o4k3HYA.png)

Congratulations! You've successfully deployed LibreChat on Zeabur.
