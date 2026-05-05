## README

# Start in development mode:

- run `docker-compose up` in the root folder
- stop the LibreChat server in your docker for desktop app
- open http://localhost:3090 in your browser
- run npm ci in root folder
- run npm run backend:dev in the root folder
- run npm run frontend:dev in the root folder

- docker compose down && docker compose up -d mongodb meilisearch vectordb rag_api
- npm run backend:dev
- npm run frontend:dev
- cd client && npm run build
- npm run create-user

# To Create new users from their email address:

- go to the scripts folder
- run "sh create_user.sh" (no quotes)

# URL For the Live APP:

https://libreclient.bluedune-a4438afc.eastus.azurecontainerapps.io/c/new

# Create a new user:

- Log into azure.portal.com as the admin
- open a command prompt inside the portal, then do the following commands:

```bash
  az containerapp exec \
  --resource-group main-container-repo \
  --name libreclient \
  --command "/bin/sh"
```

# After waiting... THEN:

```bash
    npm run invite-user XXXX@gmail.com
```

# Disable a user:

- Log into azure.portal.com as the admin
- go search for 'mongo-libre' to find the database
- open the database and go to Data Explorer in the left menu
- go to : test > users > (search for user) > click the item > add 'disabled' field with value 'true'

#Theme Colors:

- Orange: #c28770
- Green: #72b147
- Blue: #007BFF
- Aqua Green: #215156
- Yellow: #ebb951
