# Mac Installation Guide
## **Recommended : [Docker Install](docker_install.md)**

---

## **Manual Installation**

## Install the prerequisites:
  - Install Homebrew (if not already installed) by following the instructions on https://brew.sh/
  - Install Node.js and npm by running `brew install node`
  - Install MongoDB (if not using Docker) by running `brew tap mongodb/brew` and `brew install mongodb-community`

 ## Instructions:

  - Open Terminal and clone the repository by running `git clone https://github.com/danny-avila/LibreChat.git`
  - Change into the cloned directory by running cd LibreChat
  - If using MongoDB Atlas, remove &w=majority from the default connection string
Follow the instructions for setting up proxies, access tokens, and user system:
  
## [Create a MongoDB database](mongodb.md) (Required)

## [Get Your API keys and Tokens](apis_and_tokens.md) (Required)
- You must set up at least one of these tokens or APIs to run the app.

## [User/Auth System](../install/user_auth_system.md) (Optional)
- How to set up the user/auth system and Google login.

## Setup Instruction
  - Create a .env file in the api directory by running `cp .env.example .env` and edit the file with your preferred text editor, adding the required API keys, access tokens, and MongoDB connection string
  - Run npm ci from root directory `npm ci`
  - Build the client by running `npm run frontend`

### **Download MeiliSearch for macOS (optional):**
  - You can download the latest MeiliSearch binary for macOS from their GitHub releases page: https://github.com/meilisearch/MeiliSearch/releases. Look for the file named meilisearch-macos-amd64 (or the equivalent for your system architecture) and download it.

### **Make the binary executable:**
  - Open Terminal and navigate to the directory where you downloaded the MeiliSearch binary. Run the following command to make it executable:

```
chmod +x meilisearch-macos-amd64
```

### **Run MeiliSearch:**
  - Now that the binary is executable, you can start MeiliSearch by running the following command, replacing your_master_key_goes_here with your desired master key:

```
./meilisearch-macos-amd64 --master-key your_master_key_goes_here
```

  - MeiliSearch will start running on the default port, which is 7700. You can now use MeiliSearch in your LibreChat project.

  - Remember to include the MeiliSearch URL and Master Key in your .env file in the api directory. Your .env file should include the following lines:

```
MEILISEARCH_URL=http://127.0.0.1:7700
MEILISEARCH_KEY=your_master_key_goes_here
```

  - With MeiliSearch running and configured, the LibreChat project should now have the Conversation search feature enabled.

  - In the LibreChat directory, start the application by running `npm run backend`
Visit http://localhost:3080 (default port) & enjoy

## Optional but recommended:

  - Create a script to automate the starting process by creating a new file named start_chatgpt.sh in the LibreChat directory and pasting the following code:

``` bash title="LibreChat.sh"
#!/bin/bash
# Replace "your_master_key_goes_here" with your MeiliSearch Master Key
if [ -x "$(command -v ./meilisearch)" ]; then
    ./meilisearch --master-key your_master_key_goes_here &
fi
npm run backend
```

### **Make the script executable by running** 

```
  chmod +x start_chatgpt.sh
```

### **Start LibreChat by running** 
```
  ./start_chatgpt.sh
```


## **Update**
- run `git pull` from the root dir
- Run npm ci from root directory `npm ci`
- Build the client by running `npm run frontend`

---

### Note: If you're still having trouble, before creating a new issue, please search for similar ones on our [#issues thread on our discord](https://discord.gg/weqZFtD9C4) or our [troubleshooting discussion](https://github.com/danny-avila/LibreChat/discussions/categories/troubleshooting) on our Discussions page. If you don't find a relevant issue, feel free to create a new one and provide as much detail as possible.
