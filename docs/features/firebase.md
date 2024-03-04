---
title: 🔥 Firebase CDN Setup
description: This document provides instructions for setting up Firebase CDN for LibreChat
weight: -6
---

# Firebase CDN Setup

## Steps to Set Up Firebase

1. Open the [Firebase website](https://firebase.google.com/).
2. Click on "Get started."
3. Sign in with your Google account.

### Create a New Project

- Name your project (you can use the same project as Google OAuth).

![Project Name](https://github.com/danny-avila/LibreChat/assets/81851188/dccce3e0-b639-41ef-8142-19d24911c65c)

- Optionally, you can disable Google Analytics.

![Google Analytics](https://github.com/danny-avila/LibreChat/assets/81851188/5d4d58c5-451c-498b-97c0-f123fda79514)

- Wait for 20/30 seconds for the project to be ready, then click on "Continue."

![Continue](https://github.com/danny-avila/LibreChat/assets/81851188/6929802e-a30b-4b1e-b124-1d4b281d0403)

- Click on "All Products."

![All Products](https://github.com/danny-avila/LibreChat/assets/81851188/92866c82-2b03-4ebe-807e-73a0ccce695e)

- Select "Storage."

![Storage](https://github.com/danny-avila/LibreChat/assets/81851188/b22dcda1-256b-494b-a835-a05aeea02e89)

- Click on "Get Started."

![Get Started](https://github.com/danny-avila/LibreChat/assets/81851188/c3f0550f-8184-4c79-bb84-fa79655b7978)

- Click on "Next."

![Next](https://github.com/danny-avila/LibreChat/assets/81851188/2a65632d-fe22-4c71-b8f1-aac53ee74fb6)

- Select your "Cloud Storage location."

![Cloud Storage Location](https://github.com/danny-avila/LibreChat/assets/81851188/c094d4bc-8e5b-43c7-96d9-a05bcf4e2af6)

- Return to the Project Overview.

![Project Overview](https://github.com/danny-avila/LibreChat/assets/81851188/c425f4bb-a494-42f2-9fdc-ff2c8ce005e1)

- Click on "+ Add app" under your project name, then click on "Web."

![Web](https://github.com/danny-avila/LibreChat/assets/81851188/22dab877-93cb-4828-9436-10e14374e57e)

- Register the app.

![Register App](https://github.com/danny-avila/LibreChat/assets/81851188/0a1b0a75-7285-4f03-95cf-bf971bd7d874)

- Save all this information in a text file.

![Save Information](https://github.com/danny-avila/LibreChat/assets/81851188/056754ad-9d36-4662-888e-f189ddb38fd3)

- Fill all the `firebaseConfig` variables in the `.env` file.

```bash
FIREBASE_API_KEY=api_key #apiKey
FIREBASE_AUTH_DOMAIN=auth_domain #authDomain
FIREBASE_PROJECT_ID=project_id #projectId
FIREBASE_STORAGE_BUCKET=storage_bucket #storageBucket
FIREBASE_MESSAGING_SENDER_ID=messaging_sender_id #messagingSenderId
FIREBASE_APP_ID=1:your_app_id #appId
```

- Return one last time to the Project Overview.

![Project Overview](https://github.com/danny-avila/LibreChat/assets/81851188/c425f4bb-a494-42f2-9fdc-ff2c8ce005e1)

- Select `Storage`

![image](https://github.com/danny-avila/LibreChat/assets/32828263/16a0f850-cdd4-4875-8342-ab67bfb59804)

- Select `Rules` and delete `: if false;` on this line: `allow read, write: if false;`

    - your updated rules should look like this:

    ```bash
    rules_version = '2';
    service firebase.storage {
      match /b/{bucket}/o {
        match /{allPaths=**} {
          allow read, write 
        }
      }
    }
    ```

![image](https://github.com/danny-avila/LibreChat/assets/32828263/c190011f-c1a6-47c7-986e-8d309b5f8704)

- Publish your updated rules

![image](https://github.com/danny-avila/LibreChat/assets/32828263/5e6a17c3-5aba-419a-a18f-be910b1f25d5)

### Configure `fileStrategy` in `librechat.yaml`

Finally, to enable the app use Firebase, you must set the following in your `librechat.yaml` config file.

```yaml
  version: 1.0.1
  cache: true
  fileStrategy: "firebase" # This is the field and value you need to add
  endpoints:
    custom:
      - name: "Mistral"
  # Rest of file omitted
```

For more information about the `librechat.yaml` config file, [see the guide here](../install/configuration/custom_config.md).