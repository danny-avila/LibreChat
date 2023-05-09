# Mac Install
Thanks to @heathriel!
##

**Install the prerequisites**:
  - Install Homebrew (if not already installed) by following the instructions on https://brew.sh/
  - Install Node.js and npm by running `brew install node`
  - Install MongoDB (if not using Docker) by running `brew tap mongodb/brew` and `brew install mongodb-community`
  - Install Docker (optional) by following the instructions on https://docs.docker.com/desktop/mac/install/
  - Obtain an OpenAI API key, BingAI and ChatGPT access tokens as described in the original instructions

  - Install Homebrew (if not already installed) by following the instructions on https://brew.sh/
  - Install Node.js and npm by running brew install node
  - Install MongoDB (if not using Docker) by running brew tap mongodb/brew and brew install mongodb-community

 **Instructions:**

  - Open Terminal and clone the repository by running git clone https://github.com/danny-avila/chatgpt-clone.git
  - Change into the cloned directory by running cd chatgpt-clone
  - If using MongoDB Atlas, remove &w=majority from the default connection string
Follow the instructions for setting up proxies, access tokens, and user system:

**Access Tokens:**

**ChatGPT Free Instructions:**

  - To get your Access token for ChatGPT 'Free Version', log in to chat.openai.com, then visit https://chat.openai.com/api/auth/session.
  - Warning: There may be a high chance of your account being banned with this method. Continue doing so at your own risk.

**BingAI Instructions:**

  - To get the Bing Access Token, navigate to bing.com using a web browser such as Chrome or Safari, and ensure you're logged in.
  - Open the Developer Tools (in Chrome or Safari, press Cmd + Option + I).
  - Click on the "Application" tab (Chrome) or "Storage" tab (Safari).
  - Expand the "Cookies" section under "Storage".
  - Copy the value of the "_U" cookie and save it somewhere. You'll need it later.

**Set up proxy in the local environment (for Mac):**

**Option 1: Set system-level environment variable**

  - Open Terminal and run export PROXY="http://127.0.0.1:7890"
  - Change http://127.0.0.1:7890 to your proxy server

**Option 2: Set in .env file**

  - Open the .env file in the api directory with a text editor
  - Add PROXY="http://127.0.0.1:7890" to the file
  - Change http://127.0.0.1:7890 to your proxy server

**Set up proxy in the Docker environment (for Mac):**

  - Open the docker-compose.yml file with a text editor
  - Under services, find the api section, and then locate the environment section
  - Add the line - "PROXY=http://127.0.0.1:7890" under the environment section
  - Change http://127.0.0.1:7890 to your proxy server



  - Create a .env file in the api directory by running cp api/.env.example api/.env and edit the file with your preferred text editor, adding the required API keys, access tokens, and MongoDB connection string
  - Run npm ci in both the api and client directories by running:

```
cd api && npm ci && cd ..
cd client && npm ci && cd ..
```

  - Build the client by running cd client && npm run build && cd ..

**Download MeiliSearch for macOS:**
  - You can download the latest MeiliSearch binary for macOS from their GitHub releases page: https://github.com/meilisearch/MeiliSearch/releases. Look for the file named meilisearch-macos-amd64 (or the equivalent for your system architecture) and download it.

**Make the binary executable:**
  - Open Terminal and navigate to the directory where you downloaded the MeiliSearch binary. Run the following command to make it executable:

```
chmod +x meilisearch-macos-amd64
```

**Run MeiliSearch:**
  - Now that the binary is executable, you can start MeiliSearch by running the following command, replacing your_master_key_goes_here with your desired master key:

```
./meilisearch-macos-amd64 --master-key your_master_key_goes_here
```

  - MeiliSearch will start running on the default port, which is 7700. You can now use MeiliSearch in your ChatGPT-Clone project.

  - Remember to include the MeiliSearch URL and Master Key in your .env file in the api directory. Your .env file should include the following lines:

```
MEILISEARCH_URL=http://127.0.0.1:7700
MEILISEARCH_KEY=your_master_key_goes_here
```

  - With MeiliSearch running and configured, the ChatGPT-Clone project should now have the Conversation search feature enabled.

  - In the chatgpt-clone directory, start the application by running cd api && npm start
Visit http://localhost:3080 (default port) & enjoy

**Optional but recommended:**

  - Create a script to automate the starting process by creating a new file named start_chatgpt.sh in the chatgpt-clone directory and pasting the following code:

```
#!/bin/bash
# Replace "your_master_key_goes_here" with your MeiliSearch Master Key
if [ -x "$(command -v ./meilisearch)" ]; then
    ./meilisearch --master-key your_master_key_goes_here &
fi
cd api && npm start
```

**Make the script executable by running** 

```
  chmod +x start_chatgpt.sh
```

  **Start ChatGPT-Clone by running** 
```
  ./start_chatgpt.sh
```
##
**Note:**
  - To share within the network or serve as a public server, set HOST to 0.0.0.0 in the .env file.

##

## [Go Back to ReadMe](README.md)
