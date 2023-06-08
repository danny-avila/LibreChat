# How to setup various tokens and APIs for the project

This doc explains how to setup various tokens and APIs for the project. You will need some of these tokens and APIs to run the app and use its features. You must set up at least one of these tokens or APIs to run the app.

## OpenAI API key

To get your OpenAI API key, you need to:

- Go to https://platform.openai.com/account/api-keys
- Create an account or log in with your existing one
- Add a payment method to your account (this is not free, sorry 😬)
- Copy your secret key (sk-...) and save it in ./.env as OPENAI_API_KEY

## ChatGPT Free Access token

To get your Access token for ChatGPT 'Free Version', you need to:

- Go to https://chat.openai.com
- Create an account or log in with your existing one
- Visit https://chat.openai.com/api/auth/session
- Copy the value of the "access_token" field and save it in ./.env as CHATGPT_ACCESS_TOKEN

Warning: There may be a chance of your account being banned if you deploy the app to multiple users with this method. Use at your own risk. 😱

## Bing Access Token

To get your Bing Access Token, you have a few options:

- You can try leaving it blank and see if it works (fingers crossed 🤞)

- You can follow these [new instructions](https://github.com/danny-avila/LibreChat/issues/370#issuecomment-1560382302) (thanks @danny-avila for sharing 🙌)

- You can use MS Edge, navigate to bing.com, and do the following:
  - Make sure you are logged in
  - Open the DevTools by pressing F12 on your keyboard
  - Click on the tab "Application" (On the left of the DevTools)
  - Expand the "Cookies" (Under "Storage")
  - Copy the value of the "\_U" cookie and save it in ./.env as BING_ACCESS_TOKEN

## Google's PaLM 2

To setup PaLM 2 (via Google Cloud Vertex AI API), you need to:

- Enable the Vertex AI API on Google Cloud:
  - Go to https://console.cloud.google.com/vertex-ai
  - Click on "Enable API" if prompted
- Create a Service Account:
  - Go to https://console.cloud.google.com/projectselector/iam-admin/serviceaccounts/create?walkthrough_id=iam--create-service-account#step_index=1
  - Select or create a project
  - Enter a service account name and description
  - Click on "Create and Continue" to give at least the "Vertex AI User" role
  - Click on "Done"
- Create a JSON key, rename as 'auth.json' and save it in /api/data/:
  - Go back to https://console.cloud.google.com/projectselector/iam-admin/serviceaccounts
  - Select your service account
  - Click on "Keys"
  - Click on "Add Key" and then "Create new key"
  - Choose JSON as the key type and click on "Create"
  - Download the key file and rename it as 'auth.json'
  - Save it in /api/data/

##

That's it! You're all set. 🎉

##

## Go Back to Your Install Documentation:
- [Docker Install](docker_install.md)
- [Linux Install](linux_install.md)
- [Mac Install](mac_install.md)
- [Windows Install](windows_install.md)

##

## [Go Back to ReadMe](../../README.md)


