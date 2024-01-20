---
title: ⏹️ Render
description: How to deploy LibreChat on Render
weight: -4
---
# Render Deployment

## Note:

Some features will not work:
- Bing/Sydney: success may vary
- Meilisearch: additional configuration is needed, [see guide here](./meilisearch_in_render.md).

Also:
- You need to create an online MongoDB Atlas Database to be able to properly deploy

## Create an account

**1.** visit [https://render.com/](https://render.com/) and click on 'Get Started for Free` to create an account and Login

**2.** Go into your dashboard

**3.** Select `New` then `Web Service`
  
  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/4edeceaf-6032-4bd0-9575-0dda76fd9958)

**4.** Add `https://github.com/danny-avila/LibreChat` in the public repositories section and click `continue`
  
  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/4f3990f9-ab91-418d-baf3-05fef306a991)

**5.** Give it a unique name and continue with the free tier and click on the `create web service` button in the bottom of the page
  
  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/ec7604ed-f833-4c23-811a-b99bdd09fb34)

**6.** At that point it will try to automatically deploy, you should cancel the deployment as it is not properly configured yet.

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/7b6973b1-68fa-4877-b78f-9cb2ee6e4f33)


## Add Environement Variables

**1.** Next you want to go in the `Environement` section of the menu to manually add the `Environement Variables`
  - You need to use the `Add Environement Variables` and add them one by one as adding a secret file will not work in our case.

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/4a1a08d5-a1f0-4e24-8393-d6740c58b19a)

**2.** You will need to copy and paste all of these:

| Key | Value |
| --- | --- |
| ALLOW_REGISTRATION | true |
| ANTHROPIC_API_KEY | user_provided |
| BINGAI_TOKEN |  | 
| CHATGPT_TOKEN | user_provided |
| CREDS_IV | e2341419ec3dd3d19b13a1a87fafcbfb |
| CREDS_KEY | f34be427ebb29de8d88c107a71546019685ed8b241d8f2ed00c3df97ad2566f0 |
| HOST | 0.0.0.0 |
| JWT_REFRESH_SECRET | secret |
| JWT_SECRET | secret |
| OPENAI_API_KEY | user_provided |
| GOOGLE_KEY | user_provided |
| PORT | 3080 |
| SESSION_EXPIRY | (1000 * 60 * 60 * 24) * 7 |

> ⬆️ **Add a single space in the value field for any endpoints that you wish to disable.**

**DO NOT FORGET TO SAVE YOUR CHANGES**

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/1101669f-b793-4e0a-80c2-7784131f7dae)


**3.** Also add `DOMAIN_CLIENT` `DOMAIN_SERVER` and use the custom render address you were attributed in the value fields

| Key | Value |
| --- | --- |
| DOMAIN_CLIENT | add your custom `onrender.com` address here |
| DOMAIN_SERVER | add your custom `onrender.com` address here |

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/735afb66-0adc-4ae3-adbc-54f2648dd5a1)


## Create and Configure your Database

The last thing you need is to create a MongoDB Atlas Database and get your connection string.
You can also restrict access to your Mongodb to only the [static outgoing IP addresses](https://docs.render.com/static-outbound-ip-addresses) for your Render hosted web service.

Follow the instructions in this document but add each of the outgoing IP addresses to the list instead of all hosts: [Online MongoDB Database](../install/configuration/mongodb.md)

## Complete the Environment Variables configuration 

**1.** Go back to render.com and enter one last key / value in your `Environment Variables`

| Key | Value |
| --- | --- |
| MONGO_URI | `mongodb+srv://USERNAME:PASSWORD@render-librechat.fgycwpi.mongodb.net/?retryWrites=true&w=majority` |

**2.** **Important**: Remember to replace `<password>` with the database password you created earlier (when you did **step 6** of the database creation **(do not leave the `<` `>` each side of the password)**

**3.** Save Changes

**4.** You should now have all these variables 

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/a99ef7b1-8fd3-4fd4-999f-45fc28378ad9)


## Deployment

**1.** Now click on `Manual Deploy` and select `Deploy latest commit`

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/d39baffd-e15d-422e-b866-a29501795a34)

**2.** It will take a couple of minutes

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/418ce867-b15e-4532-abcc-e4b601748a58)

**3.** When it's ready you will see `your service is live 🎉` in the console and the green `Live` icon on top

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/c200e052-8a12-46b2-9f64-b3cdff146980)

## Conclusion
You can now access it by clicking the link, congrattulation, you've sucessfully deployed LibreChat on render.com

### Note: If you're still having trouble, before creating a new issue, please search for similar ones on our [#issues thread on our discord](https://discord.gg/weqZFtD9C4) or our [troubleshooting discussion](https://github.com/danny-avila/LibreChat/discussions/categories/troubleshooting) on our Discussions page. If you don't find a relevant issue, feel free to create a new one and provide as much detail as possible.
