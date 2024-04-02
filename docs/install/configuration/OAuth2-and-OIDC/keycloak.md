---
title: Keycloak
description: Learn how to configure LibreChat to use Keycloak for user authentication.
weight: -5
---

# Keycloak

1. **Access Keycloak Admin Console:**
- Open the Keycloak Admin Console in your web browser. This is usually 
found at a URL like `http://localhost:8080/auth/admin/`.

2. **Create a Realm (if necessary):**
- If you don't already have a realm for your application, create one. Click on 'Add Realm' and give it a name.

3. **Create a Client:**
- Within your realm, click on 'Clients' and then 'Create'.
- Enter a client ID and select 'openid-connect' as the Client Protocol.
- Set 'Client Authentication' to 'On'.
- In 'Valid Redirect URIs', enter `http://localhost:3080/oauth/openid/callback` or the appropriate URI for 
your application.

![image](https://github.com/danny-avila/LibreChat/assets/6623884/d956de3d-e1f7-4327-818a-f146eb86a949)

![image](https://github.com/danny-avila/LibreChat/assets/6623884/fbefbc05-b4ec-4122-8229-54a0a5876d76)

![image](https://github.com/danny-avila/LibreChat/assets/6623884/f75c7b0f-030e-4182-bf87-ccf3aeae17d4)


4. **Configure Client:**
- After creating the client, you will be redirected to its settings page.
- Note the 'Client ID' and 'Secret' from the 'Credentials' tab – you'll need these for your application.

![image](https://github.com/danny-avila/LibreChat/assets/6623884/b1c1f0b6-641b-4cf7-a7f1-a9a32026d51b)


5. **Add Roles (Optional):**
If you want to restrict access to users with specific roles, you can define roles in Keycloak and assign them to users.
- Go to the 'Roles' tab in your client or realm (depending on where you want to define the roles).
- Create a new role that matches the value you have in `OPENID_REQUIRED_ROLE`.

![image](https://github.com/danny-avila/LibreChat/assets/6623884/67ca635f-5082-4dcc-97ac-019029a81d7c)

6. **Assign Roles to Users (Optional):**
- Go to 'Users', select a user, and go to the 'Role Mappings' tab.
- Assign the appropriate role (that matches `OPENID_REQUIRED_ROLE`) to the user.

![image](https://github.com/danny-avila/LibreChat/assets/6623884/f2ea70ed-e16c-4ec8-b84f-79fbfca627be)

7. **Get path of roles list inside token (Optional):**
- Decode your jwtToken from OpenID provider and determine path for roles list inside access token. For example, if you are 
    using Keycloak, the path is `realm_access.roles`.
- Put this path in `OPENID_REQUIRED_ROLE_PARAMETER_PATH` variable in `.env` file.
- By parameter `OPENID_REQUIRED_ROLE_TOKEN_KIND` you can specify which token kind you want to use. 
 Possible values are `access` and `id`.

8**Update Your Project's Configuration:**
- Open the `.env` file in your project folder and add the following variables:
  ```
  OPENID_ISSUER=http://localhost:8080/auth/realms/[YourRealmName]
  OPENID_CLIENT_ID=[YourClientID]
  OPENID_CLIENT_SECRET=[YourClientSecret]
  OPENID_CALLBACK_URL=http://localhost:3080/oauth/openid/callback
  OPENID_SCOPE="openid profile email"
  OPENID_REQUIRED_ROLE=[YourRequiredRole]
  OPENID_REQUIRED_ROLE_TOKEN_KIND=(access|id)
  OPENID_REQUIRED_ROLE_PARAMETER_PATH="realm_access.roles"
  ```
