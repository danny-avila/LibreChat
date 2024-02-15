---
title: 🔎 Meilisearch in Render
description: Setup Meilisearch on Render (for use with the Render deployment guide)
weight: -3
---
# Utilize Meilisearch by running LibreChat on Render

## Create a new account or a new project on Render

**1.** Visit **[https://render.com/](https://render.com/)** and click on `Start Free` to create an account and sign in

**2.** Access your control panel

**3.** Select `New` and then `Web Service`

  ![image](https://github.com/danny-avila/LibreChat/assets/32828263/36e7fa0d-aa7a-4505-ad9b-a2daabaca712)

**4.** Add `https://github.com/itzraiss/Meilisearch` to the public repositories section and click `continue`
  
  ![image](https://github.com/danny-avila/LibreChat/assets/32828263/9a982355-a575-4e95-8d21-dffaf8252426)

**5.** Assign a unique name and proceed with the free option and click on the `create web service` button at the bottom of the page
  
  ![image](https://github.com/danny-avila/LibreChat/assets/32828263/691132c7-afea-4125-9ca5-a9a8854dc1c2)

## Click on Advanced to add Environment Variables 

  ![image](https://github.com/danny-avila/LibreChat/assets/32828263/0fb3e3cf-9cfd-463c-8b02-a31354f0cabb)

## Add the Environment Variables

**1.** To manually add the `Environment Variables`
  - You need to use `Add Environment Variables` and add them one at a time, as adding a secret file will not work in our case.

 ![image](https://github.com/danny-avila/LibreChat/assets/32828263/8cbc35e5-2b9b-4dad-835f-f0444627a01f)

**2.** You need to enter these values:

| Key | Value |
| --- | --- |
| MEILI_HOST | http://meilisearch:7700 |
| MEILI_HTTP_ADDR | meilisearch:7700 |
| MEILI_MASTER_KEY | Create a 44 character alphanunmeric key | 
| MEILI_NO_ANALYTICS | true |

**Deployment**

**1.** Everything is set up, now all you need to do is click on 'Create Web Service'. This will take a few seconds

  ![image](https://github.com/danny-avila/LibreChat/assets/32828263/282f0bf3-923f-4603-aaf6-0fcc5b085635)

**3.** Once it's ready, you'll see `your service is live 🎉` in the console and the green `Live` icon at the top

  ![image](https://github.com/danny-avila/LibreChat/assets/32828263/2f1cdca7-658d-4de7-95a1-915d784e1ec2)

**Get URL Address**

Once you get the message: `your service is live 🎉`, copy the URL address of your project in the top left corner of Render:

  ![image](https://github.com/danny-avila/LibreChat/assets/32828263/f879ac99-8273-467c-8389-ce54703fc1ff)

## In LibreChat Project

Now, insert the below environment variable values into your LibreChat project (Replace MEILI_HOST by adding the URL address of your Render's Meilisearch project that you copied):

| Key | Value                                 |
| --- |---------------------------------------|
| MEILI_HOST | Your Render project's Meilisearch URL |
| MEILI_HTTP_ADDR | meilisearch:7700                      |
| MEILI_MASTER_KEY | Use the key created for Meilisearch   | 
| MEILI_NO_ANALYTICS | true                                  |
| SEARCH | true                                  |

  ![image](https://github.com/danny-avila/LibreChat/assets/32828263/f4ff1310-dc6b-4a81-944e-0eece8606b86)

## Deployment

**1.** Now, click on `Manual Deployment` and select `Clear build cache & Deploy`. It will take a few minutes

  ![image](https://github.com/danny-avila/LibreChat/assets/32828263/075adc07-df7d-43e6-9d1c-783ee0cf47ea)

**3.** Once it's ready, you'll see `your service is live 🎉` in the console and the green `Live` icon at the top

  ![image](https://github.com/danny-avila/LibreChat/assets/32828263/fd7cbcc3-4854-4733-ab18-4d0efc170a83)

## Conclusion
Now, you should be able to perform searches again, congratulations, you have successfully deployed Meilisearch on render.com

### Note: If you are still having issues, before creating a new issue, please search for similar issues on our [#issues thread on our discord](https://discord.gg/weqZFtD9C4) or on our [troubleshooting discussion](https://github.com/danny-avila/LibreChat/discussions/categories/troubleshooting) on our Discussion page. If you cannot find a relevant issue, feel free to create a new one and provide as many details as possible.
