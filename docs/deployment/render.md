# Render Deployment

## Note:

Some features will not work:
- Bing/Sydney (the IP is blocked by Microsoft)
- Meilisearch

Also:
- You will have to create an online MongoDB Atlas Database to be able to properly deploy

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
| PALM_KEY | user_provided |
| PORT | 3080 |
| SESSION_EXPIRY | (1000 * 60 * 60 * 24) * 7 |

⬆️ **Add a single space in the value field for `BINGAI_TOKEN` and all other endpoints that you wish to disable.**

**DO NOT FORGET TO SAVE YOUR CHANGES**

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/1101669f-b793-4e0a-80c2-7784131f7dae)


**3.** Also add `DOMAIN_CLIENT` `DOMAIN_SERVER` and use the custom render address you were attributed in the value fields

| Key | Value |
| --- | --- |
| DOMAIN_CLIENT | add your custom `onrender.com` address here |
| DOMAIN_SERVER | add your custom `onrender.com` address here |

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/735afb66-0adc-4ae3-adbc-54f2648dd5a1)


## Create and Configure your Database

The last thing you need is to create a MongoDB Atlas Database.

**1.** Open a new tab and go to [https://account.mongodb.com/account/register](https://account.mongodb.com/account/register) to create an account

**2.** Once you have set up your account, create a new project and name it:

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/5cdeeba0-2982-47c3-8228-17e8500fd0d7)

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/97da7454-63a9-42dc-8eeb-7a3ae861c7c4)

**3.** Now select build a database:

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/f6fc986e-83fe-472c-a720-618c27bab801)

**4.** Select the free tier:

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/87037310-52f6-4217-822b-d47168464067)

**5.** Name your cluster (leave everything else default) and click create:

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/e8aa62b5-ff85-4c76-befc-2a99563e6c81)

**6.** Enter a user name and a secure password:

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/df2c407f-2124-4c5e-bc0e-f5868811e59d)

**7.** Select Cloud environement:

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/1b0d3cae-2e87-4330-920c-61be1589f041)

**8.** Click /Finish and Close:

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/103f8958-2744-42ab-9cda-75c2f33296cb)

**9.** Go to database:

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/9c487530-8b4a-4db0-8e56-cb06f7c2ff74)

**10.** Click on network access in the side menu:

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/29f287ee-caa1-4a2b-a705-bcb33f4735bb)

**11.** Add a IP Adress:

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/b870fa3f-9da2-4e2e-bd00-20bc0a67b562)

**12.** Select allow access from everywhere and confirm:

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/5cd80bda-ae6d-48f0-94c1-67b122b68357)

**13.** Now Select Database in the side menu:

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/55d15f51-b890-4664-8d0a-686597984e2f)

**14.** Connect:

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/198ca6cf-8a90-4b95-b7f7-1149a09fddfe)

**15.** Select the first option (driver)

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/d8aaf0e4-285d-4e76-bb78-591355569da7)

**16.** Copy the connection string:

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/ccc52648-39fa-4f45-8e2b-96c93ffede4a)



## Complete the Environment Variables configuration 

**1.** Go back to render.com and enter one last key / value in your `Environment Variables`

| Key | Value |
| --- | --- |
| MONGO_URI | `mongodb+srv://USERNAME:PASSWORD@render-librechat.fgycwpi.mongodb.net/?retryWrites=true&w=majority` |

**2.** **Important**: Remember to replace `<password>` with the database password you created earlier (when you did [step 6](render.md#L101) of the database creation **(do not leave the `<` `>` each side of the password)**

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

**4.** You can now access it by clicking the link!
