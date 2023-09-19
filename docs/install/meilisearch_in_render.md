# Utilize Meilisearch by running LibreChat on Render

## Create a new account or a new project on Render

**1.** Visit [https://render.com/](https://render.com/) and click on `Start Free` to create an account and sign in

**2.** Access your control panel

**3.** Select `New` and then `Web Service`
  
  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/4edeceaf-6032-4bd0-9575-0dda76fd9958)

**4.** Add `https://github.com/itzraiss/Meilisearch` to the public repositories section and click `continue`
  
  ![image](https://github.com/itzraiss/images/blob/main/Captura%20de%20tela%202023-09-19%20184044.png)

**5.** Assign a unique name and proceed with the free option and click on the `create web service` button at the bottom of the page
  
  ![image](https://github.com/itzraiss/images/blob/main/Captura%20de%20tela%202023-09-19%20185545.png)

## Click on Advanced to add Environment Variables 
  ![image](https://github.com/itzraiss/images/blob/main/imagem_2023-09-19_185841007.png)

## Add the Environment Variables

**1.** To manually add the `Environment Variables`
  - You need to use `Add Environment Variables` and add them one at a time, as adding a secret file will not work in our case.

  ![image](https://github.com/itzraiss/images/blob/main/Captura%20de%20tela%202023-09-19%20184259.png)

**2.** You need to enter these values:

| Key | Value |
| --- | --- |
| MEILI_HOST | http://meilisearch:7700 |
| MEILI_HTTP_ADDR | meilisearch:7700 |
| MEILI_MASTER_KEY | DrhYf7zENyR6AlUCKmnz0eYASOQdl6zxH7s7MKFSfFCt | 
| MEILI_NO_ANALYTICS | true |

**Deployment**

**1.** Everything is set up, now all you need to do is click on 'Create Web Service'. This will take a few seconds

  ![image](https://github.com/itzraiss/images/blob/main/Captura%20de%20tela%202023-09-19%20184303.png)

**3.** Once it's ready, you'll see `your service is live 🎉` in the console and the green `Live` icon at the top

  ![image](https://github.com/itzraiss/images/blob/main/imagem_2023-09-19_192433154.png)


**Get URL Address**

Once you get the message: `your service is live 🎉`, copy the URL address of your project in the top left corner of Render:

  ![image](https://github.com/itzraiss/images/blob/main/Captura%20de%20tela%202023-09-19%20184509.png)

## In LibreChat Project

Now, insert the below environment variable values into your LibreChat project (Replace MEILI_HOST by adding the URL address of your Render's Meilisearch project that you copied):

| Key | Value |
| --- | --- |
| MEILI_HOST | Your Render project's Meilisearch URL|
| MEILI_HTTP_ADDR | meilisearch:7700 |
| MEILI_MASTER_KEY | DrhYf7zENyR6AlUCKmnz0eYASOQdl6zxH7s7MKFSfFCt | 
| MEILI_NO_ANALYTICS | true |
| SEARCH | true |

  ![image](https://github.com/itzraiss/images/blob/main/imagem_2023-09-19_190801655.png)

## Deployment

**1.** Now, click on `Manual Deployment` and select `Clear build cache & Deploy`. It will take a few minutes

  ![image](https://github.com/itzraiss/images/blob/main/Captura%20de%20tela%202023-09-19%20193702.png)

**3.** Once it's ready, you'll see `your service is live 🎉` in the console and the green `Live` icon at the top

  ![image](https://github.com/itzraiss/images/blob/main/imagem_2023-09-19_200952435.png)

## Conclusion
Now, you should be able to perform searches again, congratulations, you have successfully deployed Meilisearch on render.com

### Note: If you are still having issues, before creating a new issue, please search for similar issues on our [#issues thread on our discord](https://discord.gg/weqZFtD9C4) or on our [troubleshooting discussion](https://github.com/danny-avila/LibreChat/discussions/categories/troubleshooting) on our Discussion page. If you cannot find a relevant issue, feel free to create a new one and provide as many details as possible.
