# Linux Installation
Thanks to @DavidDev1334 !
##

## Prerequisites

Before installing ChatGPT-Clone, make sure your machine has the following prerequisites installed:

- Git: To clone the repository.
- Node.js: To run the application.
- MongoDB: To store the chat history.

## Installation Steps

1. Clone the repository:

```bash
git clone https://github.com/danny-avila/chatgpt-clone.git
```

2. Extract the content in your desired location:

```bash
cd chatgpt-clone
unzip chatgpt-clone.zip -d /usr/local/
```

Note: The above command extracts the files to "/usr/local/chatgpt-clone". If you want to install the files to a different location, modify the instructions accordingly.

3. Enable the Conversation search feature: (optional)

- Download MeiliSearch latest release from: https://github.com/meilisearch/meilisearch/releases
- Copy it to "/usr/local/chatgpt-clone/"
- Rename the file to "meilisearch"
- Open a terminal and navigate to "/usr/local/chatgpt-clone/"
- Run the following command:

```bash
./meilisearch --master-key=YOUR_MASTER_KEY
```

Note: Replace "YOUR_MASTER_KEY" with the generated master key, which you saved earlier.

4. Install Node.js:

Open a terminal and run the following commands:

```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs
```

5. Create a MongoDB database:

- Navigate to https://www.mongodb.com/ and sign in or create an account.
- Create a new project.
- Build a Database using the free plan and name the cluster (example: chatgpt-clone).
- Use the "Username and Password" method for authentication.
- Add your current IP to the access list.
- Then in the Database Deployment tab click on Connect.
- In "Choose a connection method" select "Connect your application".
- Driver = Node.js / Version = 4.1 or later.
- Copy the connection string and save it somewhere (you will need it later).

6. Get your OpenAI API key - Visit https://platform.openai.com/account/api-keys and save your API key somewhere safe (you will need it later)

7. Get your Bing Access Token

- Using a web browser, navigate to bing.com
- Make sure you are logged in
- Open the browser DevTools by pressing F12 on your keyboard
- Click on the tab "Application" (On the left of the DevTools)
- Expand the "Cookies" (Under "Storage")
- You need to copy the value of the "_U" cookie, save it somewhere, you will need it later

8. Create the ".env" File

You will need all your credentials, (API keys, access tokens, and MongoDB Connection String, MeiliSearch Master Key)

- Open "~/chatgpt-clone/api/.env.example" in a text editor
- At this line MONGO_URI="mongodb://127.0.0.1:27017/chatgpt-clone", replace mongodb://127.0.0.1:27017/chatgpt-clone with the MongoDB connection string you saved earlier, remove "&w=majority" at the end
  - It should look something like this: "MONGO_URI="mongodb+srv://username:password@chatgpt-clone.lfbcwz3.mongodb.net/?retryWrites=true"
- At this line OPENAI_KEY= you need to add your OpenAI API key
  - Add your Bing token to this line BINGAI_TOKEN= (needed for BingChat & Sydney)
  - If you want to enable Search, SEARCH=TRUE if you do not want to enable search SEARCH=FALSE
  - Add your previously saved MeiliSearch Master key to this line MEILI_MASTER_KEY= (the key is needed if search is enabled even on local install or you may encounter errors)
  - Save the file as "~/chatgpt-clone/api/.env"

## Run the project

### Using the command line (in the root directory)
Setup the app:
1. Run `npm ci`
2. Run `npm run frontend`

Start the app:
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

gnome-terminal --tab --title="ChatGPT-Clone" --working-directory=/home/user/chatgpt-clone/api --command="bash -c 'npm start'"
# this shell script goes at the root of the chatgpt-clone directory (/home/user/chatgpt-clone/)
```

## Update the app version

If you update the chatgpt-clone project files, manually redo the npm ci and npm run build steps.

##


## [Go Back to ReadMe](../../README.md)
