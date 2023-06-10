# Linux Installation
## **Recommended : [Docker Install](docker_install.md)**

##

## **Manual Installation**

## Prerequisites

Before installing LibreChat, make sure your machine has the following prerequisites installed:

- Git: To clone the repository.
- Node.js: To run the application.
- MongoDB: To store the chat history.

## Clone the repository:

```bash
git clone https://github.com/danny-avila/LibreChat.git
git clone https://github.com/danny-avila/LibreChat.git
```

## Extract the content in your desired location:

```bash
cd LibreChat
unzip LibreChat.zip -d /usr/local/
```

Note: The above command extracts the files to "/usr/local/LibreChat". If you want to install the files to a different location, modify the instructions accordingly.

## Enable the Conversation search feature: (optional)

- Download MeiliSearch latest release from: https://github.com/meilisearch/meilisearch/releases
- Copy it to "/usr/local/LibreChat/"
- Rename the file to "meilisearch"
- Open a terminal and navigate to "/usr/local/LibreChat/"
- Run the following command:

```bash
./meilisearch --master-key=YOUR_MASTER_KEY
```

Note: Replace "YOUR_MASTER_KEY" with the generated master key, which you saved earlier.

## Install Node.js:

Open a terminal and run the following commands:

```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs
```

## Create a MongoDB database:

- Navigate to https://www.mongodb.com/ and sign in or create an account.
- Create a new project.
- Build a Database using the free plan and name the cluster (example: LibreChat).
- Use the "Username and Password" method for authentication.
- Add your current IP to the access list.
- Then in the Database Deployment tab click on Connect.
- In "Choose a connection method" select "Connect your application".
- Driver = Node.js / Version = 4.1 or later.
- Copy the connection string and save it somewhere (you will need it later).

## [Get Your API keys and Tokens](apis_and_tokens.md) (Required)
- You must set up at least one of these tokens or APIs to run the app.

## [User/Auth System](../features/user_auth_system.md) (Optional)
- How to set up the user/auth system and Google login.

## Run the project

### Using the command line (in the root directory)
Setup the app:
1. Run `npm ci`
2. Run `npm run frontend`

## Start the app:
1. Run `npm run backend`
2. Run `meilisearch --master-key put_your_meilesearch_Master_Key_here` (Only if SEARCH=TRUE)
3. Visit http://localhost:3080 (default port) & enjoy

### Using a shell script

- Create a shell script to automate the starting process
- Open a text editor
- Paste the following code in a new document
- Put your MeiliSearch master key instead of "your_master_key_goes_here"
- Save the file as "/home/user/chatgpt-clone/chatgpt-clone.sh"
- You can make a shortcut of this shell script and put it anywhere

```
#!/bin/bash
# the meilisearch executable needs to be at the root of the chatgpt-clone directory

gnome-terminal --tab --title="MeiliSearch" --command="bash -c 'meilisearch --master-key your_master_key_goes_here'"
# ↑↑↑ meilisearch is the name of the meilisearch executable, put your own master key there

gnome-terminal --tab --title="ChatGPT-Clone" --working-directory=/home/user/chatgpt-clone/ --command="bash -c 'npm run backend'"
# this shell script goes at the root of the chatgpt-clone directory (/home/user/chatgpt-clone/)
```

## Update the app version

If you update the chatgpt-clone project files, manually redo the npm ci and npm run frontend steps.

##

### Note: If you're still having trouble, before creating a new issue, please search for similar ones on our [#issues thread on our discord](https://discord.gg/weqZFtD9C4) or our [troubleshooting discussion](https://github.com/danny-avila/LibreChat/discussions/new?category=troubleshooting) on our Discussions page. If you don't find a relevant issue, feel free to create a new one and provide as much detail as possible.

##

## [Go Back to ReadMe](../../README.md)
