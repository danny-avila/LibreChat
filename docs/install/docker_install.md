# Docker



-   **Edit**  the credentials you see in  [docker-compose.yml](https://stackedit.io/docker-compose.yml) under api service as needed
    - **Provide** all necessary credentials in the ./api/.env and client/.env files before the next step
    - Docker will read those env files. See their respective `.env.example` files for reference
-   **Run**  `docker-compose up`  to start the app
-   Note: MongoDB does not support older ARM CPUs like those found in Raspberry Pis. However, you can make it work by setting MongoDB’s version to mongo:4.4.18 in docker-compose.yml, the most recent version compatible with

##

**[chatgptclone/app Tags | Docker Hub](https://hub.docker.com/r/chatgptclone/app/tags)**

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
- Build a Database using the free plan and name the cluster (example: chatgpt-clone)
- Use the "Username and Password" method for authentication
- Add your current IP to the access list
- In the Database Deployment tab, click on Connect
- "Choose a connection method" select "Connect your application"
- Driver = Node.js / Version = 4.1 or later
- Copy the connection string, fill in your password and remove `&w=majority` from default connection string.


##
**ChatGPT Free Instructions:**
  - To get your Access token for ChatGPT 'Free Version', log in to chat.openai.com, then visit https://chat.openai.com/api/auth/session.
  - Warning: There may be a high chance of your account being banned with this method. Continue doing so at your own risk.

### **Get your Bing Access Token**

  ⚠️**For better results, please follow these [new instructions](https://github.com/danny-avila/LibreChat/issues/370#issuecomment-1560382302)**   

  or 
   
  Using MS Edge, navigate to bing.com
   - Make sure you are logged in
   - Open the DevTools by pressing F12 on your keyboard
   - Click on the tab "Application" (On the left of the DevTools)
   - Expand the "Cookies" (Under "Storage")
   - Copy the value of the "\_U" cookie

##

## [Go Back to ReadMe](../../README.md)
