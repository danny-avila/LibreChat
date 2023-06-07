# Docker



-   **Edit**  the credentials you see in  [docker-compose.yml](https://stackedit.io/docker-compose.yml) under api service as needed
    - **Provide** all necessary credentials in the ./api/.env and client/.env files before the next step
    - Docker will read those env files. See their respective `.env.example` files for reference
-   **Run**  `docker-compose up`  to start the app
-   Note: MongoDB does not support older ARM CPUs like those found in Raspberry Pis. However, you can make it work by setting MongoDB’s version to mongo:4.4.18 in docker-compose.yml, the most recent version compatible with

##

**[LibreChat on Docker Hub](https://hub.docker.com/r/chatgptclone/app/tags)**

##

### Prerequisites
- Node.js >= 19.0.0 : https://nodejs.org/en/download
- MongoDB installed or [MongoDB Atlas](https://account.mongodb.com/account/login) (required if not using Docker)
    - MongoDB does not support older ARM CPUs like those found in Raspberry Pis. However, you can make it work by setting MongoDB's version to mongo:4.4.18 in docker-compose.yml, the most recent version compatible with.
    -  If using MongoDB Atlas, remove `&w=majority` from default connection string.
- [OpenAI API key](https://platform.openai.com/account/api-keys)
- BingAI, ChatGPT access tokens (optional, free AIs)

### Usage

- **Clone/download** the repo down where desired
```bash
  git clone https://github.com/danny-avila/LibreChat.git
```
##
  
 **Create a MongoDB database**
 
Navigate to https://www.mongodb.com/ and Sign In or Create an account

- Create a new project
- Build a Database using the free plan and name the cluster (example: LibreChat)
- Use the "Username and Password" method for authentication
- Add your current IP to the access list
- In the Database Deployment tab, click on Connect
- "Choose a connection method" select "Connect your application"
- Driver = Node.js / Version = 4.1 or later
- Copy the connection string, fill in your password and remove `&w=majority` from default connection string.

##

## [Get Your API keys and Tokens](apis_and_tokens.md) (Required)
- You must set up at least one of these tokens or APIs to run the app.

## [User/Auth System](../features/user_auth_system.md) (Optional)
- How to set up the user/auth system and Google login.

## Update
to update LibreChat. enter these commands one after the other from the root dir:
- git pull
- docker-compose build
- docker-compose up

##

## [Go Back to ReadMe](../../README.md)
