---
title: 🍃 Online MongoDB
description: This guide teaches you how to set up an online MongoDB database for LibreChat using MongoDB Atlas, a cloud-based service. You will learn how to create an account, a project, and a cluster, as well as how to configure your database credentials, network access, and connection string.
weight: -4
---

# Set Up an Online MongoDB Database

## Create an account
- Open a new tab and go to **[account.mongodb.com/account/register](https://account.mongodb.com/account/register)** to create an account.

## Create a project
- Once you have set up your account, create a new project and name it (the name can be anything):

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/5cdeeba0-2982-47c3-8228-17e8500fd0d7)

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/97da7454-63a9-42dc-8eeb-7a3ae861c7c4)

## Build a database
- Now select `Build a Database`:

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/f6fc986e-83fe-472c-a720-618c27bab801)

## Choose your cloud environment
- Select the free tier:

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/87037310-52f6-4217-822b-d47168464067)

## Name your cluster
- Name your cluster (leave everything else default) and click create:

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/e8aa62b5-ff85-4c76-befc-2a99563e6c81)

## Database credentials
- Enter a user name and a secure password:

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/df2c407f-2124-4c5e-bc0e-f5868811e59d)

## Select environment
- Select `Cloud Environement`:

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/1b0d3cae-2e87-4330-920c-61be1589f041)

## Complete database configuration
- Click `Finish and Close`:

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/103f8958-2744-42ab-9cda-75c2f33296cb)

## Go to your database
- Click `Go to Databases`:

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/9c487530-8b4a-4db0-8e56-cb06f7c2ff74)

## Network access
- Click on `Network Access` in the side menu:

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/29f287ee-caa1-4a2b-a705-bcb33f4735bb)

## Add IP adress
- Add a IP Adress:

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/b870fa3f-9da2-4e2e-bd00-20bc0a67b562)

## Allow access
- Select `Allow access from anywhere` and `Confirm`:

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/5cd80bda-ae6d-48f0-94c1-67b122b68357)

## Get your connection string

- Select `Database` in the side menu

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/55d15f51-b890-4664-8d0a-686597984e2f)

- Select `Connect`:

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/198ca6cf-8a90-4b95-b7f7-1149a09fddfe)


- Select the first option (`Drivers`)

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/d8aaf0e4-285d-4e76-bb78-591355569da7)

 
- Copy the `connection string`:

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/ccc52648-39fa-4f45-8e2b-96c93ffede4a)

- The URI format is `mongodb+srv://<username>:<password>@<host>/<database>?<options>`. Make sure to replace `<password>` with the database password you created in the "[database credentials](#database-credentials)" section above. Do not forget to remove the `<` `>` around the password. Also remove `&w=majority` at the end of the connection string. `retryWrites=true` is the only option you need to keep. You should also add `LibreChat` or your own `APP_TITLE` as the database name in the URI.
- example:
```
mongodb+srv://fuegovic:1Gr8Banana@render-librechat.fgycwpi.mongo.net/LibreChat?retryWrites=true
```

---

>⚠️ Note: If you're having trouble, before creating a new issue, please search for similar ones on our [#issues thread on our discord](https://discord.librechat.ai) or our [troubleshooting discussion](https://github.com/danny-avila/LibreChat/discussions/categories/troubleshooting) on our Discussions page. If you don't find a relevant issue, feel free to create a new one and provide as much detail as possible.
