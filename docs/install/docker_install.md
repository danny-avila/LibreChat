# Docker

Docker installation is recommended for most use cases. It's the easiest, simplest, and most reliable method to get started.

- Install **Docker:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) is recommended for managing your docker container
-   **Edit**  the credentials you see in  [docker-compose.yml](https://stackedit.io/docker-compose.yml) under api service as needed
    - **Provide** all necessary credentials in the /.env file before the next step
        - See my notes below for specific instructions on some of the configuration
    - Docker will read those env files. See their respective `.env.example` files for reference
-   **Run**  `docker-compose up`  to start the app
-   Note: MongoDB does not support older ARM CPUs like those found in Raspberry Pis. However, you can make it work by setting MongoDB’s version to mongo:4.4.18 in docker-compose.yml, the most recent version compatible with
-   **That's it!** If you need more detailed information on configuring your compose file, see my notes below. 
-   **If you're still having trouble, before creating a new issue, please search for similar ones on our [#issues thread on our discord](https://discord.gg/weqZFtD9C4) or our [troubleshooting discussion](https://github.com/danny-avila/LibreChat/discussions/new?category=troubleshooting) on our Discussions page. If you don't find a relevant issue, feel free to create a new one and provide as much detail as possible.**

## Config notes for docker-compose.yml file

- Any environment variables set in your compose file will override variables with the same name in your .env file. Note that the following variables are necessary to include in the compose file so they work in the docker environment, so they are included for you.
```yaml
    env_file:
      - .env
    environment:
      - HOST=0.0.0.0
      - MONGO_URI=mongodb://mongodb:27017/LibreChat
# ...
      - MEILI_HOST=http://meilisearch:7700
      - MEILI_HTTP_ADDR=meilisearch:7700
# ...
    env_file:
      - .env
    environment:
      - MEILI_HOST=http://meilisearch:7700
      - MEILI_HTTP_ADDR=meilisearch:7700
 ```
- If you'd like to change the app title or disable/enable google login, edit the following lines (the ones in your .env file are not read during building)
```yaml
      args:
        VITE_APP_TITLE: LibreChat # default, change to your desired app name
        VITE_SHOW_GOOGLE_LOGIN_OPTION: false # default, change to true if you have google auth setup
```

- If for some reason you're not able to build the app image, you can pull the latest image from **Dockerhub**.
- Comment out the following lines (CTRL+/ on most IDEs, or put a `#` in front each line)


```yaml
    image: node                # Comment this & uncomment below to build from docker hub image
    build:
      context: .
      target: node
      args:
        VITE_APP_TITLE: LibreChat # default, change to your desired app name
        VITE_SHOW_GOOGLE_LOGIN_OPTION: false # default, change to true if you have google auth setup
```

- Comment this line in (remove the `#` key)
     
     
```yaml
     # image: chatgptclone/app:latest # Uncomment this & comment above to build from docker hub image
```
- **Note:** The latest Dockerhub image is only updated with new release tags, so it may not have the latest changes to the main branch
- You also can't edit the title or toggle google login off as shown above, as these variables are set during build time.
- If you are running APIs in other docker containers that you need access to, you will need to uncomment the following lines

```yaml
    # extra_hosts: # if you are running APIs on docker you need access to, you will need to uncomment this line and next
    # - "host.docker.internal:host-gateway"
```

  - Usually, these are reverse proxies, which you can set as shown below under `environment:`


```yaml 
      environment:
      - HOST=0.0.0.0
      - MONGO_URI=mongodb://mongodb:27017/LibreChat
      - CHATGPT_REVERSE_PROXY=http://host.docker.internal:8080/api/conversation # if you are hosting your own chatgpt reverse proxy with docker
      - OPENAI_REVERSE_PROXY=http://host.docker.internal:8070/v1/chat/completions # if you are hosting your own chatgpt reverse proxy with docker
```

##

**[LibreChat on Docker Hub](https://hub.docker.com/r/chatgptclone/app/tags)**

##

### Prerequisites
- **Docker:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) is recommended for managing your docker container
- Node.js will be installed within the docker container.
- MongoDB will be installed by docker, but you can also use [MongoDB Atlas](https://account.mongodb.com/account/login) and providethe connection string in the compose file.
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
  
 **Create a MongoDB database** (Not required if you'd like to use the local database installed by Docker)
 
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
