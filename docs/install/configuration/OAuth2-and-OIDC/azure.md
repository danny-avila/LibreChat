---
title: Azure Entra
description: Learn how to configure LibreChat to use Azure Entra for user authentication.
weight: -6
---

# OpenID with Azure Entra

1. Go to the [Azure Portal](https://portal.azure.com/) and sign in with your account.
2. In the search box, type "Azure Entra" and click on it.
3. On the left menu, click on App registrations and then on New registration.
4. Give your app a name and select Web as the platform type.
5. In the Redirect URI field, enter `http://localhost:3080/oauth/openid/callback` and click on Register.

![image](https://github.com/danny-avila/LibreChat/assets/6623884/2b1aabce-850e-4165-bf76-3c1984f10b6c)

6. You will see an Overview page with some information about your app. Copy the Application (client) ID and the 
Directory (tenant) ID and save them somewhere.

![image](https://github.com/danny-avila/LibreChat/assets/6623884/e67d5e97-e26d-48a5-aa6e-50de4450b1fd)

7. On the left menu, click on Authentication and check the boxes for Access tokens and ID tokens under Implicit 
grant and hybrid flows.

![image](https://github.com/danny-avila/LibreChat/assets/6623884/88a16cbc-ff68-4b3a-ba7b-b380cc3d2366)

8. On the left menu, click on Certificates & Secrets and then on New client secret. Give your secret a 
name and an expiration date and click on Add. You will see a Value column with your secret. Copy it and 
save it somewhere. Don't share it with anyone!

![image](https://github.com/danny-avila/LibreChat/assets/6623884/31aa6cee-5402-4ce0-a950-1b7e147aafc8)

9. If you want to restrict access by groups you should add the groups claim to the token. To do this, go to
Token configuration and click on Add group claim. Select the groups you want to include in the token and click on Add.

![image](https://github.com/danny-avila/LibreChat/assets/6623884/c9d353f5-2cb2-4f00-b4f0-493cfec8fe9a)

10. Open the .env file in your project folder and add the following variables with the values you copied:

```bash
DOMAIN_CLIENT=https://your-domain.com # use http://localhost:3080 if not using a custom domain
DOMAIN_SERVER=https://your-domain.com # use http://localhost:3080 if not using a custom domain

OPENID_CLIENT_ID=Your Application (client) ID
OPENID_CLIENT_SECRET=Your client secret
OPENID_ISSUER=https://login.microsoftonline.com/Your Directory (tenant ID)/v2.0/
OPENID_SESSION_SECRET=Any random string
OPENID_SCOPE=openid profile email #DO NOT CHANGE THIS
OPENID_CALLBACK_URL=/oauth/openid/callback # this should be the same for everyone

# If you want to restrict access by groups
OPENID_REQUIRED_ROLE_TOKEN_KIND=id
OPENID_REQUIRED_ROLE_PARAMETER_PATH="roles"
OPENID_REQUIRED_ROLE="Your Group Name"
```
11. Save the .env file

> Note: If using docker, run `docker compose up -d` to apply the .env configuration changes

