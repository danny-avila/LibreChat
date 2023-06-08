# Windows Install

### Recommended: **[Docker](docker_install.md)**
or
### **[Windows Installer](https://github.com/fuegovic/LibreChat-Windows-Installer)**
(Includes a Startup and Update Utility)
##

## Manual Installation
### Install the prerequisites on your machine

### **Download LibreChat**
   
  - Download the latest release here: https://github.com/danny-avila/LibreChat/releases/
  - Or by clicking on the green code button in the top of the page and selecting "Download ZIP"
  - Open Terminal (command prompt) and clone the repository by running `git clone https://github.com/danny-avila/LibreChat.git`
  - If you downloaded a zip file, extract the content in "C:/LibreChat/" 
  - **IMPORTANT : If you install the files somewhere else modify the instructions accordingly**
  
### **Enable the Conversation search feature:** (optional)
		
  - Download MeiliSearch latest release from : https://github.com/meilisearch/meilisearch/releases
  - Copy it to "C:/LibreChat/"
  - Rename the file to "meilisearch.exe"
  - Open it by double clicking on it
  - Copy the generated Master Key and save it somewhere (You will need it later)

### **Download and Install Node.js**
    
  - Navigate to https://nodejs.org/en/download and to download the latest Node.js version for your OS (The Node.js installer includes the NPM package manager.)
    
### **Create a MongoDB database**
    
  - Navigate to https://www.mongodb.com/ and Sign In or Create an account
  - Create a new project
  - Build a Database using the free plan and name the cluster (example: LibreChat)
  - Use the "Username and Password" method for authentication
  - Add your current IP to the access list
  - Then in the Database Deployment tab click on Connect
  - In "Choose a connection method" select "Connect your application"
  - Driver = Node.js / Version = 4.1 or later
  - Copy the connection string and save it somewhere(you will need it later)
    
### [Get Your API keys and Tokens](apis_and_tokens.md) (Required)
- You must set up at least one of these tokens or APIs to run the app.

### [User/Auth System](../features/user_auth_system.md) (Optional)
- How to set up the user/auth system and Google login.


### **Create the ".env" File** 
You will need all your credentials, (API keys, access tokens, and Mongo Connection String, MeileSearch Master Key)
  - Open the .env.example file in your install folder e.g. "C:/LibreChat/.env.example" in a text editor
  - At this line **MONGO_URI="mongodb://127.0.0.1:27017/LibreChat"**
    Replace mongodb://127.0.0.1:27017/LibreChat with the MondoDB connection string you saved earlier, **remove "&w=majority" at the end**
    - It should look something like this: "MONGO_URI="mongodb+srv://username:password@LibreChat.lfbcwz3.mongodb.net/?retryWrites=true"
  - At this line **OPENAI_API_KEY=** you need to add your openai API key
  - Add your Bing token to this line **BINGAI_TOKEN=** (needed for BingChat & Sydney)
  - If you want to enable Search, **SEARCH=TRUE** if you do not want to enable search **SEARCH=FALSE**
  - Add your previously saved MeiliSearch Master key to this line **MEILI_MASTER_KEY=** (the key is needed if search is enabled even on local install or you may encounter errors)
  - Save the file as .env at the root of your install dir e.g. **"C:/LibreChat/.env"**

## Run the app

### Using the command line (in the root directory)
To setup the app:
1. Run `npm ci`
2. Run `npm run frontend`

To use the app:
1. Run `npm run backend`
2. Run `meilisearch --master-key put_your_meilesearch_Master_Key_here` (Only if SEARCH=TRUE)
3. Visit http://localhost:3080 (default port) & enjoy

#### Using a batch file

- **Make a batch file to automate the starting process**
  - Open a text editor
  - Paste the following code in a new document
  - The meilisearch executable needs to be at the root of the LibreChat directory
  - Put your MeiliSearch master key instead of "your_master_key_goes_here"
  - Save the file as "C:/LibreChat/LibreChat.bat"
  - you can make a shortcut of this batch file and put it anywhere

```
start "MeiliSearch" cmd /k "meilisearch --master-key your_master_key_goes_here

start "LibreChat" cmd /k "npm run backend"

REM this batch file goes at the root of the LibreChat directory (C:/LibreChat/)
```
##

## **Update**
- run `git pull` from the root dir
- Run npm ci from root directory `npm ci`
- Build the client by running `npm run frontend`


##

### Note: If you're still having trouble, you can create an [#issues thread on our discord](https://discord.gg/weqZFtD9C4), or a [troubleshooting discussion](https://github.com/danny-avila/LibreChat/discussions/new?category=troubleshooting) on our Discussions page.

##

## [Go Back to ReadMe](../../README.md)
