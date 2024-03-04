---
title: 🤗 HuggingFace
description: Easily deploy LibreChat on Hugging Face Spaces
weight: -9
---
# Hugging Face Deployment 🤗

## Create and Configure your Database (Required)

The first thing you need is to create a MongoDB Atlas Database and get your connection string.

Follow the instructions in this document: **[Online MongoDB Database](../install/configuration/mongodb.md)**

## Getting Started

**1.** Login or Create an account on **[Hugging Face](https://huggingface.co/)**

**2.** Visit **[https://huggingface.co/spaces/LibreChat/template](https://huggingface.co/spaces/LibreChat/template)** and click on `Duplicate this Space` to copy the LibreChat template into your profile. 

> Note: It is normal for this template to have a runtime error, you will have to configure it using the following guide to make it functional.

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/fd684254-cbe0-4039-ba4a-7c492b16a453)

**3.** Name your Space and Fill the `Secrets` and `Variables`
 
  >You can also decide here to make it public or private

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/13a039b9-bb78-4d56-bab1-74eb48171516)

You will need to fill these values:

| Secrets | Values |
| --- | --- |
| MONGO_URI | * use the string aquired in the previous step |
| OPENAI_API_KEY | `user_provided` | 
| BINGAI_TOKEN | `user_provided` | 
| CHATGPT_TOKEN | `user_provided` |
| ANTHROPIC_API_KEY | `user_provided` |
| GOOGLE_KEY | `user_provided` |
| CREDS_KEY | * see bellow |
| CREDS_IV | * see bellow |
| JWT_SECRET | * see bellow |
| JWT_REFRESH_SECRET | * see bellow |

> ⬆️ **Leave the value field blank for any endpoints that you wish to disable.** 

> ⚠️ setting the API keys and token to `user_provided` allows you to provide them safely from the webUI

> * For `CREDS_KEY`, `CREDS_IV` and `JWT_SECRET` use this tool: **[https://replit.com/@daavila/crypto#index.js](https://replit.com/@daavila/crypto#index.js)**
> * Run the tool a second time and use the new `JWT_SECRET` value for the `JWT_REFRESH_SECRET`

| Variables | Values |
| --- | --- |
| APP_TITLE | LibreChat |
| ALLOW_REGISTRATION | true |


## Deployment

**1.** When you're done filling the `secrets` and `variables`, click `Duplicate Space` in the bottom of that window

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/55d596a3-2be9-4e14-ac0d-0b493d463b1b)


**2.** The project will now build, this will take a couple of minutes

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/f9fd10e4-ae50-4b5f-a9b5-0077d9e4eaf6)


**3.** When ready, `Building` will change to `Running` 

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/91442e84-9c9e-4398-9011-76c479b6f272)

  And you will be able to access LibreChat!

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/cd5950d4-ecce-4f13-bbbf-b9109e462e10)

## Update
  To update LibreChat, simply select `Factory Reboot` from the ⚙️Settings menu

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/66f20129-0ffd-44f5-b91c-fcce1932112f)


## Conclusion
  You can now access it with from the current URL. If you want to access it without the Hugging Face overlay, you can modify this URL template with your info:

  `https://username-projectname.hf.space/` 
  
  e.g. `https://cooluser-librechat.hf.space/`

### 🎉 Congratulation, you've sucessfully deployed LibreChat on Hugging Face! 🤗
